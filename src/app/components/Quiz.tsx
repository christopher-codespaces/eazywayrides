"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, RefreshCcw } from "lucide-react";

import { app } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import {
  doc,
  getFirestore,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  Timestamp,
} from "firebase/firestore";

type QuizOption = {
  key: "A" | "B" | "C" | "D";
  text: string;
};

export type QuizQuestion = {
  id: string; // e.g. "q1"
  prompt: string;
  options: QuizOption[];
  correctKey: QuizOption["key"]; // store correct answer key
};

export type QuizProps = {
  moduleId: string; // e.g. "m1"
  passMark: number; // e.g. 80
  questions: QuizQuestion[];
  // optional: callback for parent page
  onPassed?: (scorePct: number) => void;
  onFailed?: (scorePct: number) => void;
};

type Attempt = {
  scorePct: number;
  correctCount: number;
  total: number;
  passed: boolean;
  submittedAt: any; // serverTimestamp
};

const BRAND = { orange: "#F36C21" };

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function calcScorePct(correct: number, total: number) {
  if (!total) return 0;
  return clamp(Math.round((correct / total) * 100));
}

export default function QuizCard({
  moduleId,
  passMark,
  questions,
  onPassed,
  onFailed,
}: QuizProps) {
  const db = useMemo(() => (app ? getFirestore(app) : null), []);
  const auth = useMemo(() => (app ? getAuth(app) : null), []);

  const [answers, setAnswers] = useState<Record<string, QuizOption["key"]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | {
    scorePct: number;
    correctCount: number;
    total: number;
    passed: boolean;
  }>(null);

  const total = questions.length;

  const canSubmit = useMemo(() => {
    // must answer all questions
    return total > 0 && Object.keys(answers).length === total && !submitting;
  }, [answers, total, submitting]);

  const scorePreview = useMemo(() => {
    let correct = 0;
    for (const q of questions) {
      if (answers[q.id] && answers[q.id] === q.correctKey) correct++;
    }
    return { correct, scorePct: calcScorePct(correct, total) };
  }, [answers, questions, total]);

  const reset = () => {
    setAnswers({});
    setResult(null);
  };

const submit = async () => {
  if (!auth || !db) {
    alert("Firebase not initialized. Please refresh the page.");
    return;
  }
  const user = auth.currentUser;
  if (!user) {
    alert("You must be logged in to submit the quiz.");
    return;
  }

  let correct = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctKey) correct++;
  }

  const scorePct = calcScorePct(correct, total);
  const passed = scorePct >= passMark;

  setSubmitting(true);
  try {
    const userRef = doc(db, "users", user.uid);

    const attempt: Attempt = {
      scorePct,
      correctCount: correct,
      total,
      passed,
      submittedAt: Timestamp.now(), // ✅ FIX
    };

    const status = passed ? "completed" : "in_progress";

    await updateDoc(userRef, {
      [`trainingProgress.${moduleId}.quiz.lastScore`]: scorePct,
      [`trainingProgress.${moduleId}.quiz.passed`]: passed,
      [`trainingProgress.${moduleId}.quiz.lastAttemptAt`]: serverTimestamp(), // ✅ OK here
      [`trainingProgress.${moduleId}.quiz.attempts`]: arrayUnion(attempt),
      [`trainingProgress.${moduleId}.status`]: status,
      lastTrainingUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const res = { scorePct, correctCount: correct, total, passed };
    setResult(res);

    if (passed) onPassed?.(scorePct);
    else onFailed?.(scorePct);
  } catch (e) {
    console.error("Quiz submit failed:", e);
    alert("Quiz submit failed. Check console for details.");
  } finally {
    setSubmitting(false);
  }
};

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-black">Quick Quiz</h3>
          <p className="text-sm text-black mt-1">
            {questions.length} questions • pass {passMark}%
          </p>
        </div>

        {result ? (
          result.passed ? (
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-700">
              <CheckCircle2 size={18} />
            </div>
          ) : (
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-700">
              <XCircle size={18} />
            </div>
          )
        ) : (
          <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
            <span className="text-sm font-bold">Q</span>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {questions.map((q, idx) => {
          const selected = answers[q.id];
          return (
            <div key={q.id} className="rounded-2xl border p-4">
              <p className="text-sm font-semibold text-black">
                {idx + 1}. {q.prompt}
              </p>

              <div className="mt-3 grid grid-cols-1 gap-2">
                {q.options.map((opt) => {
                  const isSelected = selected === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() =>
                        setAnswers((a) => ({ ...a, [q.id]: opt.key }))
                      }
                      className={[
                        "w-full text-left rounded-xl border px-3 py-2 text-sm transition",
                        isSelected
                          ? "border-orange-200 bg-orange-50"
                          : "hover:bg-gray-50",
                      ].join(" ")}
                      disabled={!!result || submitting}>
                      <span className="font-semibold mr-2">{opt.key})</span>
                      {opt.text}
                    </button>
                  );
                })}
              </div>

              {result && (
                <div className="mt-3 text-xs">
                  {answers[q.id] === q.correctKey ? (
                    <span className="text-green-700 font-semibold">
                      Correct ✅
                    </span>
                  ) : (
                    <span className="text-red-700 font-semibold">
                      Incorrect ❌ (Correct: {q.correctKey})
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-5">
        {!result ? (
          <>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Answered {Object.keys(answers).length}/{total}
              </span>
              <span>Preview score: {scorePreview.scorePct}%</span>
            </div>

            <button
              onClick={submit}
              disabled={!canSubmit}
              className="mt-3 w-full px-4 py-3 rounded-xl text-sm font-semibold text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: BRAND.orange }}>
              {submitting ? "Submitting..." : "Submit quiz"}
            </button>

            <p className="mt-2 text-xs text-gray-500">
              Your score will be saved to your profile for admin tracking.
            </p>
          </>
        ) : (
          <div className="rounded-2xl border p-4 bg-gray-50">
            <p className="text-sm font-semibold text-gray-900">
              Result: {result.scorePct}% ({result.correctCount}/{result.total})
            </p>
            <p
              className={[
                "text-sm mt-1 font-semibold",
                result.passed ? "text-green-700" : "text-red-700",
              ].join(" ")}>
              {result.passed
                ? "Passed ✅ Module marked as completed."
                : "Not passed ❌ Module remains in progress."}
            </p>

            <button
              type="button"
              onClick={reset}
              className="mt-3 w-full px-4 py-3 rounded-xl text-sm font-semibold border hover:bg-white transition flex items-center justify-center gap-2">
              <RefreshCcw size={16} /> Retake quiz
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
