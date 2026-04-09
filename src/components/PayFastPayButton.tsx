"use client";

import React, { useState } from "react";
import { app } from "@/lib/firebase";
import { getAuth } from "firebase/auth";

const PAYFAST_SANDBOX_URL = "https://sandbox.payfast.co.za/eng/process";

type BundleId =
  | "starter_single"
  | "starter_3"
  | "growth_single"
  | "growth_8"
  | "scale_single"
  | "scale_20"
  | "enterprise_custom";

const BUNDLES: Record<
  BundleId,
  { label: string; price: number; credits: number }
> = {
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

interface PayButtonProps {
  bundleId: BundleId;
  /** Called when payment is successfully created and user is about to be redirected */
  onReady?: (paymentId: string, redirectUrl: string) => void;
  /** Called if any error occurs */
  onError?: (message: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function PayFastPayButton({
  bundleId,
  onReady,
  onError,
  className,
  style,
}: PayButtonProps) {
  const [loading, setLoading] = useState(false);
  const auth = app ? getAuth(app) : null;

  const handlePay = async () => {
    setLoading(true);

    try {
      if (!auth) throw new Error("Firebase not initialised.");
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in.");

      const idToken = await user.getIdToken(true);

      // ------------------------------------------------------------------
      // STEP 1: Create payment in Firestore via API
      // ------------------------------------------------------------------
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ bundleId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);

      const { redirectUrl, paymentId } = data as {
        redirectUrl: string;
        paymentId: string;
      };

      console.log("[PayFast] Payment created:", paymentId);
      console.log("[PayFast] Redirect URL:", redirectUrl);

      onReady?.(paymentId, redirectUrl);

      // ------------------------------------------------------------------
      // STEP 2: Redirect to PayFast
      // ------------------------------------------------------------------
      window.location.href = redirectUrl;
    } catch (e: any) {
      console.error("[PayFast] Pay error:", e);
      onError?.(e?.message ?? "Payment setup failed.");
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePay}
      disabled={loading}
      className={className}
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        padding: "0.75rem 1.5rem",
        borderRadius: "0.75rem",
        fontWeight: 600,
        fontSize: "0.875rem",
        color: "#fff",
        background: "linear-gradient(90deg, #F36C21, #E02020)",
        border: "none",
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.7 : 1,
        transition: "opacity 0.2s",
      }}
    >
      {loading ? "Redirecting to PayFast…" : "💳 Pay Now"}
    </button>
  );
}
