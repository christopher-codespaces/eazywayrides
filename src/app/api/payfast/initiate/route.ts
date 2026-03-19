// src/app/api/payfast/initiate/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "@/lib/firebaseAdmin.server"; // <- your helper file

type PlanId = "starter_3" | "growth_8" | "scale_20" | "enterprise_custom";

const BUNDLES: Record<
  PlanId,
  { label: string; price: number; credits: number }
> = {
  starter_3: { label: "Starter Bundle (3 credits)", price: 499, credits: 3 },
  growth_8: { label: "Growth Bundle (8 credits)", price: 1199, credits: 8 },
  scale_20: { label: "Scale Bundle (20 credits)", price: 2499, credits: 20 },
  enterprise_custom: {
    label: "Enterprise (21 credits / deposit)",
    price: 2999,
    credits: 21,
  },
};

function toQueryString(params: Record<string, string>) {
  // PayFast wants normal URL encoding, spaces as + is okay, but encodeURIComponent is fine here.
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim())}`)
    .join("&");
}

function makeSignature(params: Record<string, string>, passphrase?: string) {
  // 1) Sort params alphabetically by key
  const sortedKeys = Object.keys(params).sort();
  const sortedParams: Record<string, string> = {};
  for (const k of sortedKeys) sortedParams[k] = params[k];

  // 2) Build query string
  let qs = toQueryString(sortedParams);

  // 3) Append passphrase if provided
  if (passphrase && passphrase.trim().length > 0) {
    qs += `&passphrase=${encodeURIComponent(passphrase.trim())}`;
  }

  // 4) MD5 hash
  return crypto.createHash("md5").update(qs).digest("hex");
}

export async function POST(req: Request) {
  const tag = `[payfast/initiate]`;

  try {
    // -------------------------
    // 1) Parse body
    // -------------------------
    const body = await req.json().catch(() => null);
    const planId = body?.planId as PlanId | undefined;

    console.log(tag, "Incoming body:", body);

    if (!planId || !(planId in BUNDLES)) {
      return NextResponse.json(
        { error: "Invalid planId", received: planId || null },
        { status: 400 },
      );
    }

    // -------------------------
    // 2) Verify Firebase ID token (get uid)
    // -------------------------
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    console.log(tag, "Auth header present:", Boolean(authHeader));
    console.log(tag, "Token length:", token?.length || 0);

    if (!token) {
      return NextResponse.json(
        { error: "Missing Authorization Bearer token" },
        { status: 401 },
      );
    }

    const adminApp = getAdminApp();
    const decoded = await getAuth(adminApp).verifyIdToken(token);
    const uid = decoded?.uid;

    console.log(tag, "Decoded uid:", uid);

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    // -------------------------
    // 3) Read env
    // -------------------------
    const merchant_id = process.env.PAYFAST_MERCHANT_ID || "";
    const merchant_key = process.env.PAYFAST_MERCHANT_KEY || "";
    const passphrase = process.env.PAYFAST_PASSPHRASE || "";
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const mode = (process.env.PAYFAST_MODE || "sandbox").toLowerCase(); // "sandbox" | "live"

    const payfastHost =
      mode === "live"
        ? "https://www.payfast.co.za/eng/process"
        : "https://sandbox.payfast.co.za/eng/process";

    console.log(tag, "Mode:", mode);
    console.log(tag, "APP_URL:", appUrl);
    console.log(tag, "Merchant id present:", Boolean(merchant_id));
    console.log(tag, "Merchant key present:", Boolean(merchant_key));

    // Helpful “sanity before sleeping” response if you haven’t set credentials yet
    if (!merchant_id || !merchant_key) {
      return NextResponse.json(
        {
          error:
            "Missing PAYFAST_MERCHANT_ID or PAYFAST_MERCHANT_KEY in env. Add them and restart dev server.",
          debug: {
            mode,
            planId,
            uid,
            appUrl,
            merchant_id_present: Boolean(merchant_id),
            merchant_key_present: Boolean(merchant_key),
          },
        },
        { status: 400 },
      );
    }

    // -------------------------
    // 4) Build PayFast params
    // -------------------------
    const bundle = BUNDLES[planId];
    const item_name = bundle.label;
    const amount = bundle.price.toFixed(2);

    // Unique payment id (you can use this as payments doc id later)
    const m_payment_id = `pf_${uid}_${planId}_${Date.now()}`;

    const return_url = `${appUrl}/business/buy-credits/success`;
    const cancel_url = `${appUrl}/business/buy-credits/cancel`;
    const notify_url = `${appUrl}/api/payfast/itn`;

    const params: Record<string, string> = {
      merchant_id,
      merchant_key,
      return_url,
      cancel_url,
      notify_url,

      // Buyer details (optional; keep empty for MVP)
      name_first: "",
      name_last: "",
      email_address: "",

      m_payment_id,
      amount,
      item_name,
      item_description: planId, // store planId here too

      // Super simple linking for ITN
      custom_str1: uid,
      custom_str2: planId,
    };

    // -------------------------
    // 5) Signature + redirect url
    // -------------------------
    const signature = makeSignature(params, passphrase);
    const redirectUrl = `${payfastHost}?${toQueryString({ ...params, signature })}`;

    console.log(tag, "m_payment_id:", m_payment_id);
    console.log(
      tag,
      "redirectUrl (first 120 chars):",
      redirectUrl.slice(0, 120),
    );

    // -------------------------
    // 6) Return redirect url
    // -------------------------
    return NextResponse.json({
      redirectUrl,
      m_payment_id,
      uid,
      planId,
      amount,
      mode,
    });
  } catch (err: any) {
    console.error(tag, "ERROR:", err);
    return NextResponse.json(
      {
        error: err?.message || "Server error",
        hint: "Check server logs (terminal) for full stack trace.",
      },
      { status: 500 },
    );
  }
}
