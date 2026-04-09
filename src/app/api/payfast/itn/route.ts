/**
 * PayFast ITN Handler (Node.js) for Firebase Firestore credits
 *
 * SECURITY REQUIREMENTS (non-negotiable):
 * - Frontend must NOT send signature (Pay Now Button has no signature field)
 * - Backend ITN must verify signature + validate with PayFast (/eng/query/validate)
 *   BEFORE any Firestore updates
 * - Firestore updates must be idempotent and transactional (no double credits)
 * - Only credit users after: signature verify AND PayFast validation AND
 *   merchant_id match AND amount match AND Firestore idempotency check
 *
 * Common failure points causing signature mismatches:
 * 1. Using encodeURIComponent instead of phpUrlEncode (spaces become %20 not +)
 * 2. Sorting keys for ITN signature (ITN preserves original order)
 * 3. Not using raw body (middleware parsing changes encoding/order)
 * 4. Wrong or inconsistent passphrase between sandbox/live
 * 5. Not calling /eng/query/validate endpoint
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  phpUrlEncode,
  buildPfParamString,
  verifyPayfastSignature,
  zarToCents,
  getPayfastHost,
  validateWithPayfast,
} from "@/lib/payfast";

export const runtime = "nodejs";

const PAYFAST_MERCHANT_ID = String(process.env.PAYFAST_MERCHANT_ID ?? "").trim();
const PAYFAST_PASSPHRASE = String(process.env.PAYFAST_PASSPHRASE ?? "").trim() || null;
const PAYFAST_MODE = process.env.PAYFAST_MODE ?? "live";

/**
 * Parse form-encoded body preserving parameter order.
 * We use req.text() directly to get the raw body — do NOT use req.json()
 * which would misinterpret the content type.
 */
async function parseFormBody(req: NextRequest): Promise<{ rawBody: string; params: URLSearchParams }> {
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  return { rawBody, params };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(`[${requestId}] [payfast/itn] ${msg}`, extra ?? "");

  // ─────────────────────────────────────────────────────────────
  // 1) Method and Content-Type validation
  // ─────────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    log("ITN rejected: method not POST", { method: req.method });
    return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
  }

  const contentType = String(req.headers.get("content-type") ?? "");
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    log("ITN rejected: content-type not x-www-form-urlencoded", { contentType });
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  if (!PAYFAST_MERCHANT_ID) {
    log("Missing PAYFAST_MERCHANT_ID env var");
    return NextResponse.json({ error: "Server Misconfigured" }, { status: 500 });
  }

  // ─────────────────────────────────────────────────────────────
  // 2) Read raw body (critical for signature correctness)
  // ─────────────────────────────────────────────────────────────
  const { rawBody, params } = await parseFormBody(req);

  if (!rawBody) {
    log("ITN rejected: empty raw body");
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  // Hash raw body for audit/debugging
  const rawBodySha256 = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");

  // ─────────────────────────────────────────────────────────────
  // 3) Extract required ITN fields
  // ─────────────────────────────────────────────────────────────
  const m_payment_id = params.get("m_payment_id") ?? "";
  const pf_payment_id = params.get("pf_payment_id") ?? "";
  const payment_status = params.get("payment_status") ?? "";
  const merchant_id = params.get("merchant_id") ?? "";
  const signature = params.get("signature") ?? "";
  const amount_gross = params.get("amount_gross") ?? "";
  const amount_fee = params.get("amount_fee");
  const amount_net = params.get("amount_net");
  const item_name = params.get("item_name");
  const item_description = params.get("item_description");
  const email_address = params.get("email_address");
  const name_first = params.get("name_first");
  const name_last = params.get("name_last");

  // Minimal required field check
  const missing: string[] = [];
  for (const [k, v] of [
    ["m_payment_id", m_payment_id],
    ["pf_payment_id", pf_payment_id],
    ["payment_status", payment_status],
    ["merchant_id", merchant_id],
    ["signature", signature],
    ["amount_gross", amount_gross],
  ]) {
    if (!v) missing.push(k);
  }
  if (missing.length) {
    log("ITN rejected: missing required fields", { missing });
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  log("ITN received", {
    m_payment_id,
    pf_payment_id,
    payment_status,
    merchant_id,
    amount_gross,
    rawBodySha256,
  });

  // ─────────────────────────────────────────────────────────────
  // 4) Build pfParamString and verify signature
  //    (using ORIGINAL parameter order from raw body)
  // ─────────────────────────────────────────────────────────────
  const pfParamString = buildPfParamString(params.entries());

  const sigCheck = verifyPayfastSignature({
    pfParamString,
    receivedSignature: signature,
    passphrase: PAYFAST_PASSPHRASE,
  });

  log("signature check", {
    ok: sigCheck.ok,
    m_payment_id,
    pf_payment_id,
    status: payment_status,
    // Never log passphrase or computed sig in production
  });

  if (!sigCheck.ok) {
    log("ITN invalid signature", {
      received: signature,
      // computed is logged only in dev; in prod consider removing
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ─────────────────────────────────────────────────────────────
  // 5) Merchant ID match (sandbox vs live aware)
  // ─────────────────────────────────────────────────────────────
  if (String(merchant_id) !== PAYFAST_MERCHANT_ID) {
    log("merchant_id mismatch", { got: merchant_id, expected: PAYFAST_MERCHANT_ID });
    return NextResponse.json({ error: "Merchant mismatch" }, { status: 400 });
  }

  // ─────────────────────────────────────────────────────────────
  // 6) Validate with PayFast server (/eng/query/validate)
  //    Must return "VALID" to be considered verified
  // ─────────────────────────────────────────────────────────────
  const host = getPayfastHost(PAYFAST_MODE);
  const userAgent = `samson-firestore-credits/1.0 (node ${process.version}) payfast-itn`;

  const pfValidate = await validateWithPayfast({
    host,
    pfParamString,
    userAgent,
  });

  log("PayFast validate response", {
    host,
    httpStatus: pfValidate.httpStatus,
    firstLine: pfValidate.firstLine,
  });

  if (!pfValidate.ok) {
    log("ITN rejected: PayFast validate failed", {
      httpStatus: pfValidate.httpStatus,
      firstLine: pfValidate.firstLine,
    });
    // Return 400 so PayFast retries; do NOT update Firestore
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  // ─────────────────────────────────────────────────────────────
  // 7) Transaction: idempotent Firestore update
  // ─────────────────────────────────────────────────────────────
  const db = getFirestore();

  try {
    await db.runTransaction(async (tx) => {
      const paymentRef = db.collection("payments").doc(String(m_payment_id));
      const paymentSnap = await tx.get(paymentRef);

      if (!paymentSnap.exists) {
        throw new Error(`Payment doc not found: ${m_payment_id}`);
      }

      const payment = paymentSnap.data()!;

      // Required stored fields
      const userId = payment.userId as string;
      const credits = payment.credits as number;
      const amountStored = payment.amount as number;

      if (!userId || typeof credits !== "number" || typeof amountStored !== "number") {
        throw new Error(`Payment doc missing required fields: userId/credits/amount`);
      }

      // ── Idempotency gate: never double-credit ──────────────────
      const alreadyProcessed =
        payment.status === "completed" ||
        payment.processed === true ||
        payment.creditedAt != null;

      if (alreadyProcessed) {
        // Still update audit fields but do NOT re-credit
        tx.update(paymentRef, {
          "pf.pf_payment_id": String(pf_payment_id),
          "pf.payment_status": String(payment_status),
          "pf.amount_gross": String(amount_gross),
          "pf.amount_fee": amount_fee != null ? String(amount_fee) : null,
          "pf.amount_net": amount_net != null ? String(amount_net) : null,
          "pf.merchant_id": String(merchant_id),
          "pf.signature": String(signature),
          "itn.verified": true,
          "itn.verifiedAt": FieldValue.serverTimestamp(),
          "itn.rawBodySha256": rawBodySha256,
          "itn.paramString": pfParamString,
        });
        log("already processed — skipping credit update", {
          m_payment_id,
          status: payment.status,
          processed: payment.processed,
        });
        return;
      }

      // ── Amount check (compare as cents — avoid float math) ───
      const itnGrossCents = zarToCents(amount_gross);
      const storedCents = BigInt(Math.trunc(amountStored));
      if (itnGrossCents !== storedCents) {
        throw new Error(
          `Amount mismatch: itn=${itnGrossCents.toString()} stored=${storedCents.toString()}`
        );
      }

      // Fields to always write (PayFast fields + ITN audit)
      const commonPaymentUpdates = {
        "pf.pf_payment_id": String(pf_payment_id),
        "pf.payment_status": String(payment_status),
        "pf.amount_gross": String(amount_gross),
        "pf.amount_fee": amount_fee != null ? String(amount_fee) : null,
        "pf.amount_net": amount_net != null ? String(amount_net) : null,
        "pf.merchant_id": String(merchant_id),
        "pf.signature": String(signature),
        "itn.verified": true,
        "itn.verifiedAt": FieldValue.serverTimestamp(),
        "itn.rawBodySha256": rawBodySha256,
        "itn.paramString": pfParamString,
      };

      const statusUpper = String(payment_status).toUpperCase();

      if (statusUpper === "COMPLETE") {
        const userRef = db.collection("users").doc(String(userId));
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new Error(`User not found: ${userId}`);
        }

        tx.update(paymentRef, {
          ...commonPaymentUpdates,
          status: "completed",
          processed: true,
          creditedAt: FieldValue.serverTimestamp(),
        });

        tx.update(userRef, {
          "credits.balance": FieldValue.increment(credits),
        });

        log("credit applied", { userId, credits, m_payment_id });

      } else if (statusUpper === "FAILED") {
        tx.update(paymentRef, { ...commonPaymentUpdates, status: "failed" });
        log("payment failed", { m_payment_id });
      } else if (statusUpper === "CANCELLED") {
        tx.update(paymentRef, { ...commonPaymentUpdates, status: "cancelled" });
        log("payment cancelled", { m_payment_id });
      } else {
        // PENDING or unknown — store fields but do not credit
        tx.update(paymentRef, { ...commonPaymentUpdates, status: "pending" });
        log("payment pending/unknown", { m_payment_id, status: payment_status });
      }
    });

    log("ITN processed OK", { m_payment_id });
    return new NextResponse("OK", { status: 200 });

  } catch (err) {
    log("ITN processing error", {
      m_payment_id,
      pf_payment_id,
      error: err instanceof Error ? err.message : String(err),
    });
    // Return 400 so PayFast retries (do NOT acknowledge success if we didn't commit)
    return NextResponse.json({ error: "Error" }, { status: 400 });
  }
}