"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CreditCard,
  Sparkles,
  Shield,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from "lucide-react";

import { app } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import CreditBadge from "@/components/CreditBadge";
import dynamic from "next/dynamic";

const BRAND = {
  orange: "#F36C21",
  red: "#E02020",
  dark: "#0B1220",
};

type PlanId = "starter_3" | "growth_8" | "scale_20" | "enterprise_custom";

type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  badge: string;
  bundlePrice: number;
  credits: number;
  perJobEquivalent: number;
  highlights: string[];
  popular?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "starter_3",
    name: "Starter Plan",
    tagline: "Best for trying the platform",
    badge: "1–3 Jobs",
    bundlePrice: 499,
    credits: 3,
    perJobEquivalent: Math.round(499 / 3),
    highlights: [
      "Post up to 3 jobs",
      "Best value vs R199 single price",
      "Perfect for small hiring needs",
      "Credits never expire (MVP)",
    ],
  },
  {
    id: "growth_8",
    name: "Growth Plan",
    tagline: "For growing teams hiring regularly",
    badge: "4–8 Jobs",
    bundlePrice: 1199,
    credits: 8,
    perJobEquivalent: Math.round(1199 / 8),
    highlights: [
      "Post up to 8 jobs",
      "Lower cost per job vs single posting",
      "Great for weekly hiring",
      "Priority support (MVP label)",
    ],
    popular: true,
  },
  {
    id: "scale_20",
    name: "Scale Plan",
    tagline: "Best for bulk hiring",
    badge: "9–20 Jobs",
    bundlePrice: 2499,
    credits: 20,
    perJobEquivalent: Math.round(2499 / 20),
    highlights: [
      "Post up to 20 jobs",
      "Lowest cost per job",
      "Best for warehouses & logistics",
      "Ideal for multi-location hiring",
    ],
  },
  {
    id: "enterprise_custom",
    name: "Enterprise",
    tagline: "For 21+ jobs and custom needs",
    badge: "21+ Jobs",
    bundlePrice: 2999,
    credits: 21,
    perJobEquivalent: Math.round(2999 / 21),
    highlights: [
      "Custom quote for high volume",
      "Invoicing & contract options",
      "Dedicated support channel",
      "Custom reporting (admin view)",
    ],
  },
];

function money(n: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(n);
}

function BuyCreditsContent() {
  const router = useRouter();
  const auth = useMemo(() => (app ? getAuth(app) : null), []);

  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const singleJob = useMemo(
    () => ({
      name: "Single Job",
      price: 199,
      note: "Good if you only need one job right now.",
    }),
    [],
  );

// ─── PayFast Form Redirect (no window.location, no redirectUrl) ───────────────
/**
 * Initiate a PayFast payment by:
 *  1. Calling POST /api/payfast/initiate with planId + auth
 *  2. Receiving { paymentUrl, data } where data contains all PayFast fields + signature
 *  3. Building an HTML <form method="POST" action={paymentUrl}>
 *  4. Adding every field from data as a hidden <input>
 *  5. Appending the form to DOM and calling form.submit()
 *
 * ❌ Does NOT use window.location.href
 * ❌ Does NOT expect redirectUrl
 * ❌ Does not send JSON directly to PayFast
 */
async function initiatePayfastPayment(
  planId: string,
  idToken: string
): Promise<never> {
  // 1) Call backend
  const res = await fetch("/api/payfast/initiate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ planId }),
  });

  // 2) Parse response
  const result = await res.json();

  if (!res.ok) {
    throw new Error(result?.error || `Backend error (${res.status})`);
  }

  const { paymentUrl, data } = result;

  // 3) Strict validation — backend returns { paymentUrl, data }
  if (!paymentUrl || !data) {
    throw new Error("Invalid PayFast response: missing paymentUrl or data");
  }

  if (!data.signature) {
    throw new Error("Missing PayFast signature");
  }

  if (!data.amount) {
    throw new Error("Missing amount");
  }

  // 4) Debug logging (mandatory)
  console.log("PayFast URL:", paymentUrl);
  console.log("PayFast Data:", data);

  // 5) Build HTML form dynamically
  const form = document.createElement("form");
  form.method = "POST";
  form.action = paymentUrl;
  form.style.display = "none";

  // 6) Add ALL fields from data as hidden inputs
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    }
  });

  // 7) Append to DOM and submit programmatically
  document.body.appendChild(form);
  form.submit();

  // The function returns never — user is now on PayFast
  throw new Error("Should never reach here after form.submit()");
}

// ─── Checkout entrypoint ────────────────────────────────────────────────────────

const startCheckout = async (planId: PlanId) => {
  setError(null);
  setLoadingPlan(planId);

  try {
    if (!auth) {
      throw new Error("Firebase auth not initialised.");
    }

    const user = auth.currentUser;
    if (!user) {
      throw new Error("Not logged in. Please log in as a business first.");
    }

    const idToken = await user.getIdToken(true);

    // Uses form POST approach via initiatePayfastPayment
    await initiatePayfastPayment(planId, idToken);
  } catch (e: any) {
    setError(e?.message || "Payment setup failed.");
    setLoadingPlan(null);
  }
};
  return (
    <div className="min-h-screen bg-gray-50 pt-14 pb-20 md:pt-10 md:pb-10">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
              <Sparkles className="h-4 w-4" style={{ color: BRAND.orange }} />
              Buy Job Credits
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
              Choose a bundle to post jobs
            </h1>
            <p className="text-sm text-gray-600 max-w-2xl">
              Bundles give you job credits. Each job post uses{" "}
              <span className="font-semibold">1 credit</span>. MVP flow: buy
              credits → post jobs → credits decrease.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <CreditBadge />
            <button
              onClick={() => router.push("/business")}
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition active:scale-[0.99]">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Top info strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border bg-white p-4 shadow-sm flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-50 border grid place-items-center">
              <CreditCard className="h-5 w-5" style={{ color: BRAND.orange }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Simple billing
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Pay once for a bundle. Use credits anytime.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 border grid place-items-center">
              <BadgeCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                More jobs = cheaper
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Bundles reduce your effective cost per job.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-50 border grid place-items-center">
              <Shield className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Secure payments
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Checkout is handled through PayFast (ITN).
              </p>
            </div>
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={[
                "rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col",
                p.popular ? "border-orange-200 ring-2 ring-orange-100" : "",
              ].join(" ")}>
              <div
                className="p-4 border-b"
                style={
                  p.popular
                    ? { background: "linear-gradient(90deg, #FFF7ED, #FFF1F2)" }
                    : { background: "linear-gradient(90deg, #FFFFFF, #FFFFFF)" }
                }>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {p.name}
                      </p>
                      {p.popular && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                          Most popular
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{p.tagline}</p>
                  </div>
                  <div className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-700 border">
                    {p.badge}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs text-gray-500">Bundle price</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {money(p.bundlePrice)}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Includes <span className="font-semibold">{p.credits}</span>{" "}
                    job credits · ~{" "}
                    <span className="font-semibold">
                      {money(p.perJobEquivalent)}
                    </span>{" "}
                    per job
                  </p>
                </div>
              </div>

              <div className="p-4 flex-1">
                <ul className="space-y-2">
                  {p.highlights.map((h, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 border-t">
                <button
                  onClick={() => startCheckout(p.id)}
                  disabled={loadingPlan !== null}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
                  style={{
                    background: p.popular
                      ? `linear-gradient(90deg, ${BRAND.orange}, ${BRAND.red})`
                      : BRAND.dark,
                  }}>
                  {loadingPlan === p.id ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redirecting…
                    </span>
                  ) : p.id === "enterprise_custom" ? (
                    "Request quote / Pay deposit"
                  ) : (
                    "Buy bundle"
                  )}
                </button>

                <p className="text-[11px] text-gray-500 mt-2">
                  You’ll be redirected to PayFast to complete payment.
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Single job option */}
        <div className="rounded-2xl border bg-white shadow-sm p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Or post a single job
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {singleJob.note} Price:{" "}
                <span className="font-semibold">{money(singleJob.price)}</span>
              </p>
            </div>

            <button
              onClick={() => startCheckout("starter_3")}
              disabled={loadingPlan !== null}
              className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition active:scale-[0.99] disabled:opacity-60"
              title="MVP: We’ll still sell the Starter bundle. Later we can add true single-job checkout.">
              Buy Starter (MVP single-job)
            </button>
          </div>

          <p className="text-[11px] text-gray-500 mt-3">
            MVP note: for speed, we treat “single job” as the Starter checkout
            first. Later we can add a{" "}
            <span className="font-mono">single_1</span> plan.
          </p>
        </div>
      </div>
    </div>
  );
}

const BuyCredits = dynamic(() => Promise.resolve(BuyCreditsContent), {
  ssr: false,
});

export default BuyCredits;
