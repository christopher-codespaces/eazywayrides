// src/app/api/payments/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID ?? "10047375";
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY ?? "e18yd3v69i5j6";
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE ?? "ndezvetv2023jump";
const APP_URL = process.env.APP_URL ?? "https://yourapp.com";

// Sandbox vs Live
const PAYFAST_SANDBOX_URL = "https://sandbox.payfast.co.za/eng/process";
const PAYFAST_LIVE_URL = "https://www.payfast.co.za/eng/process";
const PAYFAST_PROCESS_URL =
  process.env.PAYFAST_ENV === "live" ? PAYFAST_LIVE_URL : PAYFAST_SANDBOX_URL;

type BundleId =
  | "starter_single"
  | "starter_3"
  | "growth_single"
  | "growth_8"
  | "scale_single"
  | "scale_20"
  | "enterprise_custom";

const BUNDLES: Record<BundleId, { label: string; price: number; credits: number }> = {
  starter_single: { label: "Starter: 1 job", price: 199, credits: 1 },
  starter_3: { label: "Starter Bundle: 3 jobs", price: 499, credits: 3 },
  growth_single: { label: "Growth: 1 job", price: 169, credits: 1 },
  growth_8: { label: "Growth Bundle: 8 jobs", price: 1199, credits: 8 },
  scale_single: { label: "Scale: 1 job", price: 149, credits: 1 },
  scale_20: { label: "Scale Bundle: 20 jobs", price: 2499, credits: 20 },
  enterprise_custom: {
    label: "Enterprise (21+ credits / deposit)",
    price: 2999,
    credits: 21,
  },
};

/**
 * Generate PayFast signature EXACTLY per PayFast docs:
 * 1. Sort keys alphabetically
 * 2. Remove empty values
 * 3. URL-encode values
 * 4. Build query string: key1=value1&key2=value2
 * 5. Append passphrase: ...&passphrase=PASSPHRASE
 * 6. MD5 hash
 */
function generateSignature(params: Record<string, string>, passphrase: string): string {
  const sortedKeys = Object.keys(params).sort();
  const pairs: string[] = [];

  for (const key of sortedKeys) {
    const value = params[key];
    if (value === "" || value === undefined || value === null) continue;
    const encoded = encodeURIComponent(value.toString().trim());
    pairs.push(`${key}=${encoded}`);
  }

  let sigString = pairs.join("&");
  sigString += `&passphrase=${passphrase.trim()}`;

  console.log("[payments/create] SIGNATURE STRING:", sigString);

  return crypto.createHash("md5").update(sigString).digest("hex");
}

export async function POST(req: NextRequest) {
  const tag = "[payments/create]";

  try {
    // ------------------------------------------------------------------
    // 1) Authenticate
    // ------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const uid = decoded.uid;

    // ------------------------------------------------------------------
    // 2) Parse body
    // ------------------------------------------------------------------
    const body = await req.json();
    const bundleId = body.bundleId as BundleId;
    const bundle = BUNDLES[bundleId];
    if (!bundle) {
      return NextResponse.json({ error: "Invalid bundle" }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // 3) Validate env vars
    // ------------------------------------------------------------------
    if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY) {
      console.error(tag, "Missing PayFast credentials");
      return NextResponse.json({ error: "Missing PayFast credentials" }, { status: 500 });
    }

    if (!APP_URL || APP_URL.includes("localhost") || APP_URL.includes("127.0.0.1")) {
      console.error(tag, "APP_URL must be a public domain");
      return NextResponse.json({ error: "APP_URL must be a public domain" }, { status: 500 });
    }

    // ------------------------------------------------------------------
    // 4) Get user email and business name
    // ------------------------------------------------------------------
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const email = userData?.email ?? decoded.email ?? "";
    const businessName = userData?.businessName ?? "Business";

    // ------------------------------------------------------------------
    // 5) Create pending payment in Firestore FIRST
    //    paymentId becomes m_payment_id
    // ------------------------------------------------------------------
    const paymentRef = db.collection("payments").doc(); // auto-generated ID
    const paymentId = paymentRef.id;

    await paymentRef.set({
      userId: uid,
      bundleId,
      amount: bundle.price,
      credits: bundle.credits,
      status: "pending",
      payfast: {
        m_payment_id: paymentId,
        pf_payment_id: "",
        payment_status: "",
      },
      createdAt: new Date(),
      completedAt: null,
    });

    console.log(tag, "Payment created in Firestore:", paymentId);

    // ------------------------------------------------------------------
    // 6) Build PayFast params
    // ------------------------------------------------------------------
    const params: Record<string, string> = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${APP_URL}/business/buy-credits/success`,
      cancel_url: `${APP_URL}/business/buy-credits/cancel`,
      notify_url: `${APP_URL}/api/payments/notify`,
      name_first: businessName,
      name_last: "",
      email_address: email,
      m_payment_id: paymentId, // links PayFast callback to Firestore doc
      amount: bundle.price.toFixed(2),
      item_name: bundle.label,
      custom_str1: uid,
      custom_str2: bundleId,
      custom_int1: String(bundle.credits),
    };

    // ------------------------------------------------------------------
    // 7) Generate signature (without merchant_key)
    // ------------------------------------------------------------------
    const signatureData: Record<string, string> = {};
    for (const key of Object.keys(params).sort()) {
      if (key === "merchant_key") continue;
      const value = params[key];
      if (value !== "" && value !== undefined && value !== null) {
        signatureData[key] = value;
      }
    }

    const signature = generateSignature(signatureData, PAYFAST_PASSPHRASE);

    // ------------------------------------------------------------------
    // 8) Build redirect URL with ENCODED values
    // ------------------------------------------------------------------
    const redirectParams: Record<string, string> = {};
    for (const key of Object.keys(params).sort()) {
      const value = params[key];
      if (value !== "" && value !== undefined && value !== null) {
        redirectParams[key] = encodeURIComponent(value);
      }
    }
    redirectParams.signature = signature;

    const queryString = Object.entries(redirectParams)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");

    const redirectUrl = `${PAYFAST_PROCESS_URL}?${queryString}`;

    console.log(tag, "=== PAYFAST INITIATE ===");
    console.log(tag, "PAYFAST STRING:", queryString);
    console.log(tag, "SIGNATURE:", signature);
    console.log(tag, "REDIRECT URL:", redirectUrl);
    console.log(tag, "PAYMENT ID:", paymentId);

    // ------------------------------------------------------------------
    // 9) Return redirect URL + paymentId
    // ------------------------------------------------------------------
    return NextResponse.json({
      paymentId,
      redirectUrl,
      bundleId,
      amount: bundle.price,
      credits: bundle.credits,
    });
  } catch (err: any) {
    console.error(tag, "ERROR:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
