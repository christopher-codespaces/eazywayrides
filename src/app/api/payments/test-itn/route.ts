// src/app/api/payments/test-itn/route.ts
// Test route that simulates a PayFast ITN callback
import { NextRequest, NextResponse } from "next/server";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE!;

async function readFormBody(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const data: Record<string, string> = {};
  params.forEach((v, k) => (data[k] = v));
  return data;
}

export async function POST(req: NextRequest) {
  const tag = "[payments/test-itn]";

  try {
    // ------------------------------------------------------------------
    // 1) Read body — expect test ITN data
    // ------------------------------------------------------------------
    const body = await req.json();

    console.log(tag, "TEST ITN received:", JSON.stringify(body, null, 2));

    // ------------------------------------------------------------------
    // 2) Build ITN payload from body
    // ------------------------------------------------------------------
    const itn: Record<string, string> = {
      m_payment_id:   body.m_payment_id,
      payment_status: body.payment_status,  // "COMPLETE"
      amount_gross:   body.amount_gross,
      amount_fee:     body.amount_fee ?? "0.00",
      amount_net:     body.amount_net ?? body.amount_gross,
      custom_str1:    body.custom_str1,
      custom_str2:    body.custom_str2,
      custom_int1:    body.custom_int1,
      pf_payment_id:  body.pf_payment_id ?? `test_${Date.now()}`,
      email_address:  body.email_address ?? "test@example.com",
      ...body.extra,
    };

    console.log(tag, "ITN payload:", JSON.stringify(itn, null, 2));

    // ------------------------------------------------------------------
    // 3) Signature verification (if passphrase set)
    // ------------------------------------------------------------------
    if (PAYFAST_PASSPHRASE) {
      // Import verifySignature from payfast lib
      const { verifySignature } = await import("@/lib/payfast");

      if (!verifySignature(itn, PAYFAST_PASSPHRASE)) {
        console.error(tag, "Signature mismatch in test ITN");
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
      console.log(tag, "Signature verified OK");
    }

    // ------------------------------------------------------------------
    // 4) Handle payment status
    // ------------------------------------------------------------------
    const payment_status = (itn.payment_status ?? "").toLowerCase();
    if (payment_status !== "complete" && payment_status !== "completed") {
      console.log(tag, "Payment not complete:", payment_status);
      return new NextResponse("OK", { status: 200 });
    }

    // ------------------------------------------------------------------
    // 5) Extract fields
    // ------------------------------------------------------------------
    const uid = itn.custom_str1 ?? "";
    const planId = itn.custom_str2 ?? "";
    const credits = parseInt(itn.custom_int1 ?? "0", 10);
    const amountPaid = parseFloat(itn.amount_gross ?? "0");
    const pfPaymentId = itn.pf_payment_id ?? "";
    const mPaymentId = itn.m_payment_id ?? "";

    if (!uid || !planId || !credits) {
      console.error(tag, "Missing required ITN fields", { uid, planId, credits });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // 6) Idempotency check
    // ------------------------------------------------------------------
    const db = getFirestore();
    const paymentRef = db.collection("payments").doc(mPaymentId);
    const paymentSnap = await paymentRef.get();

    if (paymentSnap.exists) {
      const existingStatus = paymentSnap.data()?.status;
      if (existingStatus === "COMPLETE" || existingStatus === "complete") {
        console.log(tag, "Payment already processed:", mPaymentId);
        return NextResponse.json({ status: "already_processed", m_payment_id: mPaymentId });
      }
    }

    // ------------------------------------------------------------------
    // 7) Update Firestore with transaction
    // ------------------------------------------------------------------
    const now = new Date();

    const batch = db.batch();

    batch.set(paymentRef, {
      uid,
      planId,
      bundle: planId,
      credits,
      amountPaid,
      pfPaymentId,
      mPaymentId,
      status: "COMPLETE",
      createdAt: paymentSnap.exists ? paymentSnap.data()?.createdAt : now,
      updatedAt: now,
    }, { merge: true });

    batch.update(db.collection("users").doc(uid), {
      "credits.balance": FieldValue.increment(credits),
      "credits.billing.lastBundleId": planId,
      "credits.billing.lastPaymentAt": now,
      "credits.billing.totalSpent": FieldValue.increment(amountPaid),
      updatedAt: now,
    });

    await batch.commit();

    console.log(tag, "TEST ITN SUCCESS — Credits added:", { uid, credits, planId, amountPaid });

    return NextResponse.json({
      status: "success",
      m_payment_id: mPaymentId,
      credits_added: credits,
      uid,
      planId,
    });
  } catch (err: any) {
    console.error(tag, "TEST ITN ERROR:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
