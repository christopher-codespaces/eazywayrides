"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PlayCircle,
  CheckCircle2,
  ClipboardCheck,
  Award,
  Lock,
  ArrowRight,
} from "lucide-react";

type ModuleStatus = "not_started" | "in_progress" | "completed";

type Module = {
  id: string;
  title: string;
  description: string;
  durationMins: number;
  videoUrl: string; // sample embed
  quiz: {
    questions: number;
    passMark: number; // %
  };
};

const BRAND = {
  orange: "#F36C21",
  red: "#E02020",
  dark: "#0B1220",
};

const SAMPLE_MODULES: Module[] = [
  {
    id: "m1",
    title: "Module 1: Road Safety Basics",
    description:
      "Core safety rules, speed discipline, helmet checks, and hazard awareness for SA roads.",
    durationMins: 8,
    videoUrl: "https://www.youtube.com/embed/4WJLlWpzpP0?rel=0",
    quiz: { questions: 5, passMark: 80 },
  },
  {
    id: "m2",
    title: "Module 2: Vehicle & Pre-Trip Checks",
    description:
      "Daily checks: tyres, brakes, lights, fluids, load security, and checklist discipline.",
    durationMins: 10,
    videoUrl: "https://www.youtube.com/embed/1Y2cY7fT7mE?rel=0",
    quiz: { questions: 6, passMark: 80 },
  },
  {
    id: "m3",
    title: "Module 3: Customer Service & Professionalism",
    description:
      "Communication, punctuality, conflict handling, and protecting your rating.",
    durationMins: 9,
    videoUrl: "https://www.youtube.com/embed/2Vv-BfVoq4g?rel=0",
    quiz: { questions: 6, passMark: 80 },
  },
  {
    id: "m4",
    title: "Module 4: App Workflow & Job Handling",
    description:
      "Accepting jobs, route discipline, proof of delivery, and reporting issues properly.",
    durationMins: 7,
    videoUrl: "https://www.youtube.com/embed/kXYiU_JCYtU?rel=0",
    quiz: { questions: 5, passMark: 80 },
  },
];

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function percent(n: number, d: number) {
  if (d <= 0) return 0;
  return clamp(Math.round((n / d) * 100));
}

export default function TrainingPage() {
  // --- Local-only progress store (later swap to Firestore) ---
  // progress[moduleId] = { status, quizScore }
  const [progress, setProgress] = useState<
    Record<string, { status: ModuleStatus; quizScore?: number }>
  >({});

  const [activeId, setActiveId] = useState(SAMPLE_MODULES[0]?.id ?? "");
  const activeModule = useMemo(
    () => SAMPLE_MODULES.find((m) => m.id === activeId) ?? SAMPLE_MODULES[0],
    [activeId],
  );

  // Load progress from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ewr_training_progress");
      if (raw) setProgress(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // Persist progress
  useEffect(() => {
    try {
      localStorage.setItem("ewr_training_progress", JSON.stringify(progress));
    } catch {
      // ignore
    }
  }, [progress]);

  const moduleIndex = useMemo(
    () => SAMPLE_MODULES.findIndex((m) => m.id === activeId),
    [activeId],
  );

  const completedCount = useMemo(() => {
    return SAMPLE_MODULES.filter((m) => progress[m.id]?.status === "completed")
      .length;
  }, [progress]);

  const overallPct = useMemo(
    () => percent(completedCount, SAMPLE_MODULES.length),
    [completedCount],
  );

  const certified = overallPct === 100;

  const getStatus = (id: string): ModuleStatus =>
    progress[id]?.status ?? "not_started";

  const isLocked = (id: string) => {
    const idx = SAMPLE_MODULES.findIndex((m) => m.id === id);
    if (idx <= 0) return false; // first is never locked
    const prev = SAMPLE_MODULES[idx - 1];
    return getStatus(prev.id) !== "completed";
  };

  const markInProgress = (id: string) => {
    setProgress((p) => ({
      ...p,
      [id]: { ...p[id], status: "in_progress" },
    }));
  };

  const completeModule = (id: string) => {
    setProgress((p) => ({
      ...p,
      [id]: { ...p[id], status: "completed" },
    }));
  };

  const takeQuickQuiz = (id: string) => {
    // Sample quiz flow: simulate a score, but still feels real
    // Later: replace with actual quiz questions.
    const score = [70, 80, 90, 100][Math.floor(Math.random() * 4)];
    setProgress((p) => ({
      ...p,
      [id]: {
        status: score >= 80 ? "completed" : "in_progress",
        quizScore: score,
      },
    }));
  };

  const goNext = () => {
    const next = SAMPLE_MODULES[moduleIndex + 1];
    if (!next) return;
    if (isLocked(next.id)) return;
    setActiveId(next.id);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
              Driver Training
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Watch modules, take quick quizzes, and unlock accomplishments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm min-w-[220px]">
              <p className="text-xs text-gray-500">Overall completion</p>
              <p className="text-lg font-semibold text-gray-900">
                {overallPct}%
              </p>
              <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${overallPct}%`,
                    backgroundColor: BRAND.orange,
                  }}
                />
              </div>
            </div>

            {certified && (
              <div className="rounded-2xl border bg-orange-50 px-4 py-3 shadow-sm flex items-center gap-2">
                <Award className="text-orange-600" />
                <div>
                  <p className="text-xs text-gray-600">Status</p>
                  <p className="font-semibold text-gray-900">Certified</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Module list */}
        <aside className="lg:col-span-1">
          <div className="rounded-2xl border bg-white shadow-sm p-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Training Modules
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Complete in order to unlock the next module.
            </p>

            <div className="mt-4 space-y-2">
              {SAMPLE_MODULES.map((m, idx) => {
                const status = getStatus(m.id);
                const locked = isLocked(m.id);
                const active = m.id === activeId;

                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (locked) return;
                      setActiveId(m.id);
                    }}
                    className={[
                      "w-full text-left rounded-2xl border p-4 transition",
                      active ? "border-orange-200 bg-orange-50" : "bg-white",
                      locked
                        ? "opacity-60 cursor-not-allowed"
                        : "hover:bg-gray-50",
                    ].join(" ")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {m.title}
                        </p>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {m.description}
                        </p>

                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                          <span>{m.durationMins} mins</span>
                          <span>•</span>
                          <span>{m.quiz.questions} Qs</span>
                          <span>•</span>
                          <span>Pass {m.quiz.passMark}%</span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {locked ? (
                          <div className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                            <Lock size={14} />
                            Locked
                          </div>
                        ) : status === "completed" ? (
                          <div className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                            <CheckCircle2 size={14} />
                            Done
                          </div>
                        ) : status === "in_progress" ? (
                          <div className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                            <PlayCircle size={14} />
                            In progress
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                            <PlayCircle size={14} />
                            Start
                          </div>
                        )}
                      </div>
                    </div>

                    {/* tiny step indicator */}
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-700 font-semibold">
                        {idx + 1}
                      </span>
                      {active ? (
                        <span className="font-semibold text-gray-900">
                          Currently viewing
                        </span>
                      ) : (
                        <span>Module</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right: Video + Quiz + Accomplishment */}
        <section className="lg:col-span-2 space-y-6">
          {/* Player */}
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5 border-b">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Now Playing
                  </p>
                  <h2 className="text-xl font-semibold text-gray-900 mt-1">
                    {activeModule.title}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {activeModule.description}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-500">Module status</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {getStatus(activeModule.id).replace("_", " ")}
                  </p>
                </div>
              </div>
            </div>

            <div className="aspect-video bg-black">
              <iframe
                src={activeModule.videoUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={activeModule.title}
              />
            </div>

            <div className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <PlayCircle className="text-orange-600" size={18} />
                <span>
                  Tip: Mark as “In progress” while you watch, then take the
                  quiz.
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => markInProgress(activeModule.id)}
                  className="px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-gray-50 transition">
                  Mark in progress
                </button>

                <button
                  onClick={() => completeModule(activeModule.id)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition"
                  style={{ backgroundColor: BRAND.orange }}>
                  Mark completed
                </button>
              </div>
            </div>
          </div>

          {/* Quiz + Accomplishment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Quiz card */}
            <div className="rounded-2xl border bg-white shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Quick Quiz
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {activeModule.quiz.questions} questions • pass{" "}
                    {activeModule.quiz.passMark}%
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                  <ClipboardCheck size={18} />
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-gray-50 border p-4">
                <p className="text-sm text-gray-700">
                  This is a **sample quiz** for now. When you click “Take quiz”,
                  we simulate a score. Later, we’ll replace this with real
                  questions.
                </p>

                {typeof progress[activeModule.id]?.quizScore === "number" && (
                  <div className="mt-3 text-sm">
                    <span className="text-gray-600">Last score:</span>{" "}
                    <span className="font-semibold text-gray-900">
                      {progress[activeModule.id]?.quizScore}%
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => takeQuickQuiz(activeModule.id)}
                className="mt-4 w-full px-4 py-3 rounded-xl text-sm font-semibold text-white transition"
                style={{
                  backgroundColor:
                    progress[activeModule.id]?.status === "completed"
                      ? "#16a34a"
                      : BRAND.orange,
                }}>
                {progress[activeModule.id]?.status === "completed"
                  ? "Quiz passed"
                  : "Take quiz"}
              </button>

              {progress[activeModule.id]?.status !== "completed" && (
                <p className="mt-2 text-xs text-gray-500">
                  Pass the quiz to complete the module automatically.
                </p>
              )}
            </div>

            {/* Accomplishment card */}
            <div className="rounded-2xl border bg-white shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Accomplishment
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Earn a badge when you complete this module.
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                  <Award size={18} />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border bg-white p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Badge
                </p>
                <p className="mt-1 text-base font-semibold text-gray-900">
                  {activeModule.title.replace("Module", "Badge")}
                </p>

                <div className="mt-3 flex items-center gap-2 text-sm">
                  {getStatus(activeModule.id) === "completed" ? (
                    <>
                      <CheckCircle2 className="text-green-600" size={18} />
                      <span className="text-green-700 font-semibold">
                        Unlocked
                      </span>
                    </>
                  ) : (
                    <>
                      <Lock className="text-gray-500" size={18} />
                      <span className="text-gray-600">
                        Complete the module to unlock
                      </span>
                    </>
                  )}
                </div>

                <div className="mt-4 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width:
                        getStatus(activeModule.id) === "completed"
                          ? "100%"
                          : "35%",
                      backgroundColor:
                        getStatus(activeModule.id) === "completed"
                          ? "#16a34a"
                          : BRAND.orange,
                    }}
                  />
                </div>
              </div>

              <button
                onClick={goNext}
                disabled={
                  !SAMPLE_MODULES[moduleIndex + 1] ||
                  isLocked(SAMPLE_MODULES[moduleIndex + 1]?.id)
                }
                className="mt-4 w-full px-4 py-3 rounded-xl text-sm font-semibold border hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                Next module <ArrowRight size={16} />
              </button>

              {certified && (
                <div className="mt-4 rounded-2xl bg-orange-50 border border-orange-200 p-4">
                  <p className="text-sm font-semibold text-gray-900">
                    🎉 You’re fully certified!
                  </p>
                  <p className="text-sm text-gray-700 mt-1">
                    Your EazyWayRides training is complete. You can now be
                    prioritised by businesses.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer note */}
          <div className="text-xs text-gray-500">
            Note: Videos are currently sample placeholders. Swap the{" "}
            <span className="font-mono">videoUrl</span> values with your real
            training content anytime.
          </div>
        </section>
      </div>
    </div>
  );
}
