// src/app/api/payments/notify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { verifySignature } from "@/lib/payfast";

export const runtime = "nodejs";

const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE ?? "ndezvetv2023jump";

const PAYFAST_IPS = [
  "197.97.145.144", "197.97.145.145", "197.97.145.146", "197.97.145.147",
  "41.74.179.194",  "41.74.179.195",  "41.74.179.196",  "41.74.179.197",
  "10.10.15.100",   "10.10.15.101",
];

async function readFormBody(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const data: Record<string, string> = {};
  params.forEach((v, k) => (data[k] = v));
  return data;
}

export async function POST(req: NextRequest) {
  const tag = "[payments/notify]";

  try {
    // ------------------------------------------------------------------
    // 1) Read and parse PayFast ITN post (form-encoded)
    // ------------------------------------------------------------------
    const itn = await readFormBody(req);

    console.log(tag, "ITN RECEIVED:", JSON.stringify(itn, null, 2));

    if (Object.keys(itn).length === 0) {
      return NextResponse.json({ error: "Empty ITN payload" }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // 2) IP validation (skip in development)
    // ------------------------------------------------------------------
    const isDev = process.env.PAYFAST_ENV !== "live";
    if (!isDev) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
      if (!PAYFAST_IPS.includes(ip)) {
        console.warn(tag, "Request from non-PayFast IP:", ip);
      }
    }

    // ------------------------------------------------------------------
    // 3) Signature verification
    // ------------------------------------------------------------------
    if (!verifySignature(itn, PAYFAST_PASSPHRASE)) {
      console.error(tag, "Signature mismatch. Received:", itn.signature);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // 4) Extract required fields
    // ------------------------------------------------------------------
    const mPaymentId = itn.m_payment_id ?? "";
    const paymentStatus = itn.payment_status ?? "";
    const pfPaymentId = itn.pf_payment_id ?? "";
    const amount = itn.amount_gross ?? "";

    if (!mPaymentId) {
      console.error(tag, "Missing m_payment_id");
      return NextResponse.json({ error: "Missing m_payment_id" }, { status: 400 });
    }

    console.log(tag, "MATCHED PAYMENT:", mPaymentId);

    // ------------------------------------------------------------------
    // 5) Fetch payment from Firestore
    // ------------------------------------------------------------------
    const db = getFirestore();
    const paymentRef = db.collection("payments").doc(mPaymentId);
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      console.error(tag, "Payment not found:", mPaymentId);
      return NextResponse.json({ error: "Payment not found" }, { status: 400 });
    }

    const payment = paymentSnap.data()!;
    console.log(tag, "PAYMENT FOUND:", JSON.stringify(payment, null, 2));

    // ------------------------------------------------------------------
    // 6) Check if already completed (idempotency)
    // ------------------------------------------------------------------
    if (payment.status === "completed") {
      console.log(tag, "Payment already completed:", mPaymentId);
      return NextResponse.json({ status: "already_completed" }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 7) Validate payment_status and amount
    // ------------------------------------------------------------------
    if (paymentStatus.toUpperCase() !== "COMPLETE") {
      console.log(tag, "Payment not complete:", paymentStatus);
      return NextResponse.json({ status: "not_complete" }, { status: 200 });
    }

    // Verify amount matches
    const expectedAmount = payment.amount?.toFixed(2);
    const paidAmount = parseFloat(amount).toFixed(2);

    if (expectedAmount !== paidAmount) {
      console.error(tag, "Amount mismatch. Expected:", expectedAmount, "Got:", paidAmount);
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // 8) Firestore transaction (CRITICAL)
    // ------------------------------------------------------------------
    const uid = payment.userId;
    if (!uid) {
      console.error(tag, "Missing userId in payment document");
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const creditsToAdd = payment.credits ?? 0;
    const amountPaid = parseFloat(amount);

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(paymentRef);
      const data = snap.data()!;

      // Double-check inside transaction
      if (data.status === "completed") {
        console.log(tag, "Already completed (inside transaction):", mPaymentId);
        return;
      }

      const now = new Date();

      // Update payment document
      transaction.update(paymentRef, {
        status: "completed",
        completedAt: now,
        "payfast.pf_payment_id": pfPaymentId,
        "payfast.payment_status": paymentStatus,
      });

      // Update user credits
      const userRef = db.collection("users").doc(uid);
      transaction.update(userRef, {
        "credits.balance": FieldValue.increment(creditsToAdd),
        "billing.totalSpent": FieldValue.increment(amountPaid),
        "billing.lastPaymentAt": now,
      });

      console.log(tag, "TRANSACTION COMMITTED:", {
        paymentId: mPaymentId,
        uid,
        creditsAdded: creditsToAdd,
        amountPaid,
      });
    });

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err: any) {
    console.error(tag, "ITN ERROR:", err);
    // Return 200 to prevent PayFast retrying
    return NextResponse.json({ error: "Server error" }, { status: 200 });
  }
}
