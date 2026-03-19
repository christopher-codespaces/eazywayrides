import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { BUNDLES, BundleId } from "@/lib/bundles";
import { makeSignature, toQueryString } from "@/lib/payfast";

export const runtime = "nodejs";

// PayFast posts x-www-form-urlencoded
async function readFormBody(req: Request) {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const data: Record<string, string> = {};
  params.forEach((v, k) => (data[k] = v));
  return data;
}

export async function POST(req: Request) {
  try {
    const db = getAdminDb();
    const env = process.env.PAYFAST_ENV || "sandbox";
    const passphrase = process.env.PAYFAST_PASSPHRASE || "";

    const itn = await readFormBody(req);

    // 1) Signature check
    const receivedSig = itn.signature || "";
    const copy = { ...itn };
    delete copy.signature;

    const expectedSig = makeSignature(copy, passphrase);
    if (!receivedSig || receivedSig !== expectedSig) {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }

    // 2) Basic sanity checks
    const uid = itn.custom_str1 || itn.uid || "";
    const bundle = (itn.custom_str2 || itn.item_description || "") as BundleId;
    const m_payment_id = itn.m_payment_id || "";
    const payment_status = (itn.payment_status || "").toLowerCase(); // COMPLETE, FAILED, etc.
    const amount_gross = Number(itn.amount_gross || "0");

    if (!uid || !bundle || !BUNDLES[bundle] || !m_payment_id) {
      return NextResponse.json(
        { error: "Missing uid/bundle/m_payment_id" },
        { status: 400 },
      );
    }

    // 3) Validate with PayFast (recommended)
    // PayFast expects you to POST the exact received content back to their validate endpoint.
    const validateUrl =
      env === "live"
        ? "https://www.payfast.co.za/eng/query/validate"
        : "https://sandbox.payfast.co.za/eng/query/validate";

    const validationRes = await fetch(validateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: toQueryString(copy), // IMPORTANT: copy without signature
    });

    const validationText = await validationRes.text();
    if (!validationRes.ok || !validationText.includes("VALID")) {
      return NextResponse.json({ error: "ITN not validated" }, { status: 400 });
    }

    // 4) Amount check (avoid tampering)
    const expectedAmount = BUNDLES[bundle].price;
    if (Number(amount_gross.toFixed(2)) !== Number(expectedAmount.toFixed(2))) {
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    // 5) Firestore: idempotent transaction
    const paymentRef = db.collection("payments").doc(m_payment_id);
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      const paySnap = await tx.get(paymentRef);

      // If already marked paid, do nothing (idempotent)
      if (paySnap.exists && paySnap.data()?.status === "paid") return;

      const isPaid =
        payment_status === "complete" || payment_status === "completed";

      const creditsToAdd = isPaid ? BUNDLES[bundle].credits : 0;

      tx.set(
        paymentRef,
        {
          uid,
          bundle,
          amount: expectedAmount,
          creditsAdded: creditsToAdd,
          status: isPaid ? "paid" : "failed",
          pf_payment_id: itn.pf_payment_id || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          paidAt: isPaid ? admin.firestore.FieldValue.serverTimestamp() : null,
          raw: itn, // optional for debugging
        },
        { merge: true },
      );

      if (isPaid) {
        tx.set(
          userRef,
          {
            credits: {
              balance: admin.firestore.FieldValue.increment(creditsToAdd),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              billing: {
                totalSpent:
                  admin.firestore.FieldValue.increment(expectedAmount),
                lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
                lastBundleId: bundle,
              },
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    });

    // PayFast expects 200 OK
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "ITN failed" },
      { status: 500 },
    );
  }
}
