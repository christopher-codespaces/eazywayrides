"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { app } from "@/lib/firebase";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const PLAN_NAMES: Record<string, string> = {
  starter_3:         "Starter Plan (3 credits)",
  growth_8:          "Growth Plan (8 credits)",
  scale_20:          "Scale Plan (20 credits)",
  enterprise_custom: "Enterprise Plan (21+ credits)",
};

export default function PaymentSuccess() {
  const router = useRouter();
  const params = useSearchParams();
  const planId = params.get("plan") ?? "";
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) { router.push("/login"); return; }

    const db = getFirestore(app);
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setCredits(snap.data()?.credits?.balance ?? 0);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border shadow-sm p-8 max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-emerald-50 border-2 border-emerald-200 grid place-items-center">
            {loading
              ? <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
              : <CheckCircle2 className="h-8 w-8 text-emerald-600" />}
          </div>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Payment successful!</h1>
          <p className="text-sm text-gray-600 mt-1">{PLAN_NAMES[planId] ?? "Your plan"} has been activated.</p>
        </div>
        {loading ? (
          <p className="text-sm text-gray-500">Loading your updated credits…</p>
        ) : (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-3">
            <p className="text-sm text-gray-600">Current credit balance</p>
            <p className="text-3xl font-bold text-emerald-700">{credits}</p>
          </div>
        )}
        <button
          onClick={() => router.push("/business")}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition">
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
