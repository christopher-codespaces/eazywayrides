"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { Coins } from "lucide-react";
import { app } from "@/lib/firebase";
import { getAuth } from "firebase/auth";

const BRAND = {
  orange: "#F36C21",
};

export default function CreditBadge() {
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = app ? getAuth(app) : null;
    const db = app ? getFirestore(app) : null;
    const user = auth?.currentUser;

    if (!user || !db) {
      setLoading(false);
      return;
    }

    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (snap.exists()) {
          setCredits(snap.data().credits ?? 0);
        } else {
          setCredits(0);
        }
      })
      .catch(() => setCredits(0))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-gray-400">
        <Coins className="h-3.5 w-3.5" />
        …
      </div>
    );
  }

  const hasCredits = (credits ?? 0) > 0;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        hasCredits
          ? "border-orange-200 bg-orange-50 text-orange-700"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      <Coins className="h-3.5 w-3.5" style={{ color: hasCredits ? BRAND.orange : "#E02020" }} />
      {credits ?? 0} credit{(credits ?? 0) !== 1 ? "s" : ""} left
    </div>
  );
}
