// components/game-navigation/CurriculumMenu.tsx
"use client";

import React from "react";
import type { ExerciseId } from "./hooks/useAppMode";
import useStudentRow from "@/hooks/students/useStudentRow";

type Props = {
  studentId?: string | null;
  onStart: (id: ExerciseId) => void;
};

const ITEMS: Array<{
  id: ExerciseId;
  title: string;
  subtitle: string;
  emoji: string;
  enabled: boolean;
  soon?: boolean;
  gradient: string;
}> = [
  {
    id: "training-game",
    title: "Training",
    subtitle: "Warm-ups • phrasing",
    emoji: "🎯",
    enabled: true,
    gradient: "from-emerald-400 via-emerald-500 to-emerald-600",
  },
  {
    id: "range-setup",
    title: "Range Setup",
    subtitle: "One-time voice range capture",
    emoji: "📏",
    enabled: true, // enabled now
    gradient: "from-sky-400 via-sky-500 to-sky-600",
  },
  {
    id: "interval-beginner",
    title: "Intervals (Beginner)",
    subtitle: "Hearing & singing simple steps",
    emoji: "🪜",
    enabled: false,
    soon: true,
    gradient: "from-indigo-400 via-indigo-500 to-indigo-600",
  },
  {
    id: "interval-scales",
    title: "Interval Scales",
    subtitle: "Scale patterns with intervals",
    emoji: "📈",
    enabled: false,
    soon: true,
    gradient: "from-violet-400 via-violet-500 to-violet-600",
  },
  {
    id: "interval-detection",
    title: "Interval Detection",
    subtitle: "Listening drills",
    emoji: "🎧",
    enabled: false,
    soon: true,
    gradient: "from-fuchsia-400 via-fuchsia-500 to-fuchsia-600",
  },
  {
    id: "keysig-detection",
    title: "Key Signature",
    subtitle: "Find the key by ear",
    emoji: "🔑",
    enabled: false,
    soon: true,
    gradient: "from-amber-400 via-amber-500 to-amber-600",
  },
  {
    id: "scale-singing-key",
    title: "Scale Singing (Key)",
    subtitle: "Sing scales within key",
    emoji: "🎶",
    enabled: false,
    soon: true,
    gradient: "from-teal-400 via-teal-500 to-teal-600",
  },
  {
    id: "scale-singing-syncopation",
    title: "Scale + Syncopation",
    subtitle: "Rhythm-forward scale work",
    emoji: "🥁",
    enabled: false,
    soon: true,
    gradient: "from-rose-400 via-rose-500 to-rose-600",
  },
  {
    id: "advanced-syncopation",
    title: "Advanced Syncopation",
    subtitle: "Complex meters & melodies",
    emoji: "🧩",
    enabled: false,
    soon: true,
    gradient: "from-slate-400 via-slate-500 to-slate-600",
  },
];

export default function CurriculumMenu({ studentId = null, onStart }: Props) {
  // Load student just for a friendly header. Safe if null.
  const { studentName } = useStudentRow({ studentIdFromQuery: studentId ?? null });

  return (
    <div className="min-h-dvh h-dvh w-full flex flex-col bg-[#0c0c0c] text-white">
      {/* Top band */}
      <header className="w-full px-6 py-5 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {studentName ? `Welcome, ${studentName}` : "Welcome"}
          </h1>
          <span className="text-sm opacity-70">Choose a practice path</span>
        </div>
      </header>

      {/* Content grid */}
      <div className="flex-1 overflow-auto px-6 pb-10">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {ITEMS.map((it) => {
              const disabled = !it.enabled;
              return (
                <button
                  key={it.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && onStart(it.id)}
                  className={[
                    "group relative rounded-2xl p-0 text-left transition transform active:scale-[0.99]",
                    disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:brightness-110",
                    "shadow-[0_10px_24px_rgba(0,0,0,0.35)]",
                    "bg-gradient-to-br",
                    it.gradient,
                  ].join(" ")}
                >
                  {/* Card interior */}
                  <div className="p-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div className="text-3xl">{it.emoji}</div>
                      {it.soon && !it.enabled && (
                        <span className="text-[10px] uppercase tracking-wide bg-black/30 px-2 py-1 rounded-full">
                          Coming soon
                        </span>
                      )}
                    </div>

                    <h3 className="mt-4 text-xl sm:text-2xl font-semibold drop-shadow-[0_1px_0_rgba(0,0,0,0.3)]">
                      {it.title}
                    </h3>
                    <p className="mt-1 text-sm sm:text-base opacity-90">{it.subtitle}</p>

                    {/* CTA */}
                    <div className="mt-5">
                      <div
                        className={[
                          "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium",
                          disabled
                            ? "bg-white/10 text-white/80"
                            : "bg-white text-black group-hover:translate-x-0.5 transition",
                        ].join(" ")}
                      >
                        {disabled ? "Locked" : "Start"}
                        {!disabled && <span aria-hidden>↗</span>}
                      </div>
                    </div>
                  </div>

                  {/* corner flourish */}
                  <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footnote */}
      <footer className="px-6 py-4 text-xs text-white/60">
        Prototype curriculum — more modes unlocking soon.
      </footer>
    </div>
  );
}
