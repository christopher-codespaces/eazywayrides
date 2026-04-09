"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Sparkles,
  Wand2,
  Loader2,
  MapPin,
  Car,
  CalendarDays,
  Banknote,
  ClipboardList,
  ArrowLeft,
  Lock,
  Coins,
} from "lucide-react";
import { app } from "@/lib/firebase";
import CreditBadge from "@/components/CreditBadge";

const BRAND = {
  orange: "#F36C21",
  red: "#E02020",
};

type VehicleType = "Car" | "Bike" | "Scooter" | "Truck" | "Van";

function addDaysToDateInput(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function PostJobPage() {
  const auth = app ? getAuth(app) : null;
  const db = app ? getFirestore(app) : null;
  const router = useRouter();

  // Credits state
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  // AI helper input
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("Car");
  const [pay, setPay] = useState("");
  const [expiry, setExpiry] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch current credits on mount
  useEffect(() => {
    if (!auth?.currentUser || !db) {
      setCreditsLoading(false);
      return;
    }

    getDoc(doc(db, "users", auth.currentUser.uid))
      .then((snap) => {
        setCredits(snap.exists() ? (snap.data().credits ?? 0) : 0);
      })
      .catch(() => setCredits(0))
      .finally(() => setCreditsLoading(false));
  }, [auth?.currentUser, db]);

  const hasCredits = (credits ?? 0) > 0;

  const runAIAutofill = async () => {
    setAiError(null);
    setError(null);
    setSuccess(null);

    if (!aiPrompt.trim()) {
      setAiError(
        "Type a short description first (route, schedule, pay, vehicle).",
      );
      return;
    }

    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/job-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setAiError(data?.error || "AI autofill failed.");
        return;
      }

      const draft = data?.draft;
      if (!draft) {
        setAiError("AI returned no draft.");
        return;
      }

      setTitle(draft.title || "");
      setDescription(draft.description || "");
      setLocation(draft.location || "");
      setVehicleType((draft.vehicleType as VehicleType) || "Car");
      setPay(String(draft.pay ?? ""));
      setExpiry(addDaysToDateInput(Number(draft.expiryDays ?? 7)));
    } catch (e: any) {
      setAiError(e?.message || "AI autofill failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!auth || !db) {
      setError("Firebase is not configured.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError("You must be logged in as a business to post a job.");
      return;
    }

    // --- Server-side credit check & deduct ---
    setLoading(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) throw new Error("User profile not found.");

      const userData = userSnap.data() as any;
      const role = userData.role as "driver" | "business" | "admin" | undefined;
      const currentCredits = userData.credits ?? 0;

      if (role !== "business")
        throw new Error("Only business accounts can post jobs.");

      if (currentCredits <= 0) {
        router.push("/business/buy-credits");
        return;
      }

      const businessName =
        userData.businessName || userData.name || userData.email || "Unknown";

      // Post the job
      const jobsRef = collection(db, "jobs");
      await addDoc(jobsRef, {
        title,
        description,
        location,
        vehicleType,
        pay: Number(pay),
        businessId: user.uid,
        businessName,
        status: "open",
        createdAt: serverTimestamp(),
        expiry: new Date(expiry + "T23:59:59.999Z"),
      });

      // Deduct 1 credit
      await updateDoc(userRef, { credits: currentCredits - 1 });

      // Update local credits display
      setCredits(currentCredits - 1);

      setSuccess("Job posted! Credit deducted.");

      setTitle("");
      setDescription("");
      setLocation("");
      setVehicleType("Car");
      setPay("");
      setExpiry("");
      setAiPrompt("");
    } catch (err: any) {
      console.error(err);
      if (err?.message === "User profile not found." || err?.message === "Only business accounts can post jobs.") {
        setError(err.message);
      } else {
        setError(err?.message || "Failed to post job.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Locked state — no credits
  if (!creditsLoading && !hasCredits) {
    return (
      <div className="min-h-screen bg-gray-50 pt-14 pb-20 md:pt-8 md:pb-10">
        <div className="mx-auto w-full max-w-3xl px-4 md:px-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                <Sparkles className="h-4 w-4" style={{ color: BRAND.orange }} />
                Post a Job
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
                Create a driver job in minutes
              </h1>
              <p className="text-sm text-gray-600">
                Use the AI helper to auto-fill the form, then review and post.
              </p>
            </div>
            <button
              onClick={() => router.push("/business")}
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition active:scale-[0.99]">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          {/* No credits block */}
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-rose-100 flex items-center justify-center">
                <Lock className="h-8 w-8 text-rose-600" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                No credits remaining
              </h2>
              <p className="text-sm text-gray-600 mt-2 max-w-sm mx-auto">
                You need at least 1 credit to post a job. Purchase a bundle to
                continue posting.
              </p>
            </div>
            <button
              onClick={() => router.push("/business/buy-credits")}
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]"
              style={{ background: `linear-gradient(90deg, ${BRAND.orange}, ${BRAND.red})` }}>
              <Coins className="h-4 w-4" />
              Buy Credits
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-14 pb-20 md:pt-8 md:pb-10">
      <div className="mx-auto w-full max-w-3xl px-4 md:px-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
              <Sparkles className="h-4 w-4" style={{ color: BRAND.orange }} />
              Post a Job
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
              Create a driver job in minutes
            </h1>
            <p className="text-sm text-gray-600">
              Use the AI helper to auto-fill the form, then review and post.
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

        {/* AI Autofill Card */}
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="p-4 md:p-5 border-b bg-gradient-to-r from-orange-50 to-rose-50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base md:text-lg font-semibold text-gray-900">
                  AI job autofill
                </h2>
                <p className="text-xs md:text-sm text-gray-600 mt-1">
                  Example: "Need a scooter driver in Cape Town CBD. Mon–Fri 9–5.
                  R450 per day. Must have smartphone."
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl grid place-items-center bg-white border shadow-sm">
                <Wand2 className="h-5 w-5" style={{ color: BRAND.orange }} />
              </div>
            </div>
          </div>

          <div className="p-4 md:p-5 space-y-3">
            <textarea
              className="w-full rounded-xl border bg-white p-3 text-sm text-gray-900
 placeholder:text-gray-400 min-h-[110px] focus:outline-none focus:ring-2"
              style={{ outlineColor: BRAND.orange }}
              placeholder="Type the job details in plain language..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />

            {aiError && <p className="text-sm text-rose-600">{aiError}</p>}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={runAIAutofill}
                disabled={aiLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
                style={{ backgroundColor: BRAND.orange }}>
                {aiLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Filling…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Auto-fill fields
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAiPrompt("");
                  setAiError(null);
                }}
                className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition active:scale-[0.99]">
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border bg-white shadow-sm p-4 md:p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-900">
              Job Title <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <ClipboardList className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="text"
                className="w-full rounded-xl border bg-white pl-9 pr-3 py-3 text-sm focus:outline-none focus:ring-2"
                style={{ outlineColor: BRAND.orange }}
                placeholder="e.g. Delivery Driver (Cape Town CBD)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-900">
              Job Description
            </label>
            <textarea
              className="w-full rounded-xl border bg-white p-3 text-sm min-h-[110px] focus:outline-none focus:ring-2"
              style={{ outlineColor: BRAND.orange }}
              placeholder="Responsibilities, requirements, schedule..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-900">
              Location <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <MapPin className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="text"
                className="w-full rounded-xl border bg-white pl-9 pr-3 py-3 text-sm focus:outline-none focus:ring-2"
                style={{ outlineColor: BRAND.orange }}
                placeholder="e.g. Cape Town, Durban, Johannesburg"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-900">
                Vehicle Type <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Car className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
                <select
                  className="w-full rounded-xl border text-black bg-white pl-9 pr-3 py-3 text-sm focus:outline-none focus:ring-2"
                  style={{ outlineColor: BRAND.orange }}
                  value={vehicleType}
                  onChange={(e) =>
                    setVehicleType(e.target.value as VehicleType)
                  }>
                  <option value="Car">Car</option>
                  <option value="Bike">Bike</option>
                  <option value="Scooter">Scooter</option>
                  <option value="Truck">Truck</option>
                  <option value="Van">Van</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-900">
                Pay (R) <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Banknote className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
                <input
                  type="number"
                  className="w-full rounded-xl border bg-white pl-9 pr-3 py-3 text-sm focus:outline-none focus:ring-2"
                  style={{ outlineColor: BRAND.orange }}
                  placeholder="e.g. 500"
                  value={pay}
                  onChange={(e) => setPay(e.target.value)}
                  min={0}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-900">
                Expiry Date <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <CalendarDays className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
                <input
                  type="date"
                  className="w-full rounded-xl border bg-white pl-9 pr-3 py-3 text-sm focus:outline-none focus:ring-2"
                  style={{ outlineColor: BRAND.orange }}
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}

          <button
            type="submit"
            disabled={loading || creditsLoading}
            className="w-full rounded-xl py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
            style={{
              background: `linear-gradient(90deg, ${BRAND.orange}, ${BRAND.red})`,
            }}>
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Posting…
              </span>
            ) : (
              "Post Job (–1 credit)"
            )}
          </button>

          <p className="text-xs text-gray-500">
            Tip: Always review AI-filled details before posting. Each job
            posting costs 1 credit.
          </p>
        </form>
      </div>
    </div>
  );
}
