"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, XCircle } from "lucide-react";

export default function PaymentCancel() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(8);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(timer);
          router.push("/business/buy-credits");
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-rose-100 flex items-center justify-center">
            <XCircle className="h-8 w-8 text-rose-600" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">Payment Cancelled</h1>
        <p className="text-gray-600">
          Your payment was cancelled and no charges were made. You can try again
          whenever you&apos;re ready. Redirecting back to buy credits in {seconds}{" "}
          seconds…
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => router.push("/business/buy-credits")}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition">
            <ArrowLeft className="h-4 w-4" />
            Back to buy credits
          </button>
        </div>
        <div className="flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </div>
    </div>
  );
}
