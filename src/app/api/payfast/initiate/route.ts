/**
 * PayFast payment initiation endpoint.
 *
 * SECURITY: The signature is generated server-side ONLY. The frontend receives
 * the signed payload and uses it to redirect the user to PayFast. The passphrase
 * is never known by the frontend.
 *
 * Frontend flow:
 *  1. Client calls POST /api/payfast/initiate with planId
 *  2. We create a pending payment doc in Firestore (credits NOT yet added)
 *  3. We return signed payment data (paymentUrl + data with signature)
 *  4. Frontend redirects user to PayFast with the signed data
 *  5. PayFast POSTs ITN to our /api/payfast/itn (server-to-server)
 *  6. ITN handler verifies signature + validates with PayFast + updates Firestore
 *  7. User is redirected to /success or /cancel (frontend polling only)
 *
 * The return_url/cancel_url are for user experience only — they NEVER trigger
 * credit updates. Only the ITN (verified) causes credits to be added.
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const PAYFAST_MERCHANT_ID = String(process.env.PAYFAST_MERCHANT_ID ?? "").trim();
const PAYFAST_MERCHANT_KEY = String(process.env.PAYFAST_MERCHANT_KEY ?? "").trim();
const PAYFAST_PASSPHRASE = String(process.env.PAYFAST_PASSPHRASE ?? "").trim();
const PAYFAST_MODE = process.env.PAYFAST_MODE ?? "live";
const APP_URL = String(process.env.APP_URL ?? "").trim();

/**
 * PHP-style URL encode:
 * - Spaces become + (not %20)
 * - Special chars !'()* get encoded
 */
function phpUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Strict field ordering for PayFast signature.
 * DO NOT use Object.entries - order must be EXACT.
 */
const ORDERED_KEYS = [
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "m_payment_id",
  "amount",
  "item_name",
] as const;

// Build these dynamically to support sandbox vs live
const PAYFAST_HOST =
  PAYFAST_MODE === "sandbox" ? "sandbox.payfast.co.za" : "www.payfast.co.za";
const PAYFAST_PROCESS_URL = `https://${PAYFAST_HOST}/eng/process`;

// Plan definitions (must match frontend BUNDLES)
type PlanId = "starter_3" | "growth_8" | "scale_20" | "enterprise_custom";

const PLAN_AMOUNTS: Record<PlanId, { amount: number; credits: number; name: string }> = {
  starter_3:         { amount: 49900, credits: 3,  name: "Starter Plan – 3 Job Credits" },
  growth_8:          { amount: 119900, credits: 8, name: "Growth Plan – 8 Job Credits" },
  scale_20:          { amount: 249900, credits: 20, name: "Scale Plan – 20 Job Credits" },
  enterprise_custom: { amount: 299900, credits: 21, name: "Enterprise Plan – 21+ Job Credits" },
};

function getReturnUrl(appUrl: string) {
  return `${appUrl}/business/buy-credits/success`;
}

function getCancelUrl(appUrl: string) {
  return `${appUrl}/business/buy-credits/cancel`;
}

function getNotifyUrl(appUrl: string) {
  return `${appUrl}/api/payfast/itn`;
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    // ── 1) Authenticate ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const uid = decoded.uid;

    // ── 2) Parse body ────────────────────────────────────────────
    const body = await req.json();
    const planId = body.planId as PlanId;

    const plan = PLAN_AMOUNTS[planId];
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // ── 3) Validate required env vars ────────────────────────────
    if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY) {
      console.error(`[${requestId}] Missing PAYFAST_MERCHANT_ID or PAYFAST_MERCHANT_KEY`);
      return NextResponse.json({ error: "Missing PayFast credentials" }, { status: 500 });
    }

    if (!APP_URL) {
      console.error(`[${requestId}] Missing APP_URL`);
      return NextResponse.json({ error: "Missing APP_URL" }, { status: 500 });
    }

    // Block localhost — PayFast requires a public notify_url
    if (
      APP_URL.includes("localhost") ||
      APP_URL.includes("127.0.0.1") ||
      APP_URL.includes("0.0.0.0")
    ) {
      console.error(`[${requestId}] APP_URL cannot be localhost: ${APP_URL}`);
      return NextResponse.json(
        { error: "APP_URL must be a public domain — no localhost allowed." },
        { status: 500 }
      );
    }

    // ── 4) Get user email from Firestore ────────────────────────
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(uid).get();
    const email = userDoc.data()?.email ?? decoded.email ?? "";

    // ── 5) Create m_payment_id (matches Firestore payment doc id) ─
    const mPaymentId = `${uid}__${planId}__${Date.now()}`;

    // ── 6) Build PayFast form params WITH signature ───────────────
    //    Amount is stored as INTEGER CENTS, convert to decimal string for PayFast
    const formattedAmount = (plan.amount / 100).toFixed(2);

    const payfastParams: Record<string, string> = {
      merchant_id:    PAYFAST_MERCHANT_ID,
      merchant_key:   PAYFAST_MERCHANT_KEY,
      return_url:     getReturnUrl(APP_URL),
      cancel_url:     getCancelUrl(APP_URL),
      notify_url:     getNotifyUrl(APP_URL),
      m_payment_id:   mPaymentId,
      amount:         formattedAmount,
      item_name:      plan.name,
    };

    // ── 7) Generate signature ────────────────────────────────────
    // Build param string in strict field order
    let paramString = "";
    ORDERED_KEYS.forEach((key) => {
      const value = payfastParams[key];
      if (value !== undefined && value !== null && value !== "") {
        paramString += `${key}=${phpUrlEncode(value)}&`;
      }
    });
    paramString = paramString.slice(0, -1); // Remove trailing &

    // Append passphrase
    paramString += `&passphrase=${phpUrlEncode(PAYFAST_PASSPHRASE)}`;

    // Generate MD5 signature
    const signature = crypto.createHash("md5").update(paramString).digest("hex");

    // ── MANDATORY LOGGING ─────────────────────────────────────────
    console.log(`[PayFast] paymentId: ${mPaymentId}`);
    console.log(`[PayFast] raw amount (cents): ${plan.amount}`);
    console.log(`[PayFast] formatted amount: ${formattedAmount}`);
    console.log(`[PayFast] paramString BEFORE hash: ${paramString}`);
    console.log(`[PayFast] generated signature: ${signature}`);

    // Build final data object with signature
    const data = {
      ...payfastParams,
      signature,
    };

    // ── 8) Create pending payment record in Firestore ───────────
    //    amount is stored as INTEGER CENTS (required for idempotent amount
    //    comparison in the ITN handler to avoid float math issues).
    const paymentRef = db.collection("payments").doc(mPaymentId);

    await paymentRef.set(
      {
        userId: uid,
        planId,
        bundle: planId,
        amount: plan.amount, // integer cents
        credits: plan.credits,
        status: "pending",
        m_payment_id: mPaymentId,
        createdAt: new Date(),
      },
      { merge: true }
    );

    // ── 9) Return redirect URL and data to frontend ──────────────
    console.log(`[${requestId}] Payment initiated`, {
      uid,
      planId,
      m_payment_id: mPaymentId,
      amount: plan.amount,
      credits: plan.credits,
      mode: PAYFAST_MODE,
    });

    return NextResponse.json({
      paymentUrl: PAYFAST_PROCESS_URL,
      data,
    }, { status: 200 });

  } catch (err) {
    console.error(`[${requestId}] initiate error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}