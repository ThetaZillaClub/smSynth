// components/setup/range/stage/RangeFooter.tsx
"use client";

import React from "react";
import PlayPauseButton from "@/components/training/layout/footer/controls/PlayPauseButton";

type Step = "low" | "high";

export default function RangeFooter({
  step,
  progressPct,
  displayNote,
  hasCapture,
  isDone,
  error,
  running,
  onToggle,
  onReset,
  onConfirm,
}: {
  step: Step;
  progressPct: number;           // 0..100
  displayNote: string | null;    // e.g. "C4"
  hasCapture: boolean;
  isDone: boolean;
  error: string | null;
  running: boolean;
  onToggle: () => void;
  onReset: () => void;
  onConfirm: () => void;
}) {
  function RoundIconButton({
    onClick,
    "aria-label": ariaLabel,
    title,
    glow = false,
    children,
  }: {
    onClick: () => void;
    "aria-label": string;
    title?: string;
    glow?: boolean;
    children: React.ReactNode;
  }) {
    const base = [
      "relative inline-flex items-center justify-center",
      "w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full",
      "bg-gradient-to-b from-[#fefefe] to-zinc-50 text-zinc-900",
      "ring-1 ring-inset ring-black/5",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(0,0,0,0.08)]",
      "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(0,0,0,0.12)]",
      "hover:ring-black/10",
      "active:scale-95",
      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40",
      "transition-all duration-200",
      "overflow-visible",
    ].join(" ");

    const glowCls = glow
      ? "ring-green-500/40 shadow-[0_0_0_3px_rgba(16,185,129,0.15),0_12px_32px_rgba(16,185,129,0.22)]"
      : "";

    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        className={`${base} ${glowCls}`}
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute -inset-2 rounded-full blur transition-opacity duration-300 bg-green-400/25 ${
            glow ? "opacity-100" : "opacity-0"
          }`}
        />
        <span className="relative block w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9">
          {children}
        </span>
      </button>
    );
  }

  return (
    <footer className="w-full bg-transparent px-4 md:px-6 py-3">
      <div className="w-[90%] mx-auto">
        <div className="rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.12)] px-3 md:px-4 py-2 bg-[#f1f1f1]">
          <div className="grid grid-cols-[1fr_auto_minmax(0,1fr)] items-center gap-4">
            {/* left: step + progress */}
            <div className="justify-self-start w-full min-w-0">
              <div className="flex items-center gap-3 text-xs text-[#2d2d2d]">
                <span>
                  Step:{" "}
                  <span className="font-semibold">
                    {step === "low" ? "Low note" : "High note"}
                  </span>
                </span>
                {!isDone && (
                  <span className="inline-flex items-center gap-2">
                    <span>Progress</span>
                    <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md bg-white text-[#0f0f0f] border border-[#dcdcdc] font-semibold">
                      {Math.round(progressPct)}%
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* center control */}
            <div className="justify-self-center">
              {isDone ? (
                // Restart
                <RoundIconButton onClick={onReset} aria-label="Restart" glow={false}>
                  <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden>
                    <path
                      d="M12 6a6 6 0 105.196 9.066l1.473 1.473A8 8 0 114 12h2a6 6 0 006-6V3l4 4-4 4V6z"
                      fill="currentColor"
                    />
                  </svg>
                </RoundIconButton>
              ) : hasCapture ? (
                // Confirm (glowing green)
                <RoundIconButton onClick={onConfirm} aria-label="Confirm" glow>
                  <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden>
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19l12-12-1.4-1.4z" fill="currentColor" />
                  </svg>
                </RoundIconButton>
              ) : (
                // Play / Pause with green glow when running
                <PlayPauseButton running={running} onToggle={onToggle} />
              )}
            </div>

            {/* right: status/note + error */}
            <div className="justify-self-end w-full min-w-0 overflow-hidden">
              <div className="w-full flex items-center justify-end gap-x-4 flex-nowrap">
                {hasCapture && displayNote && !isDone && (
                  <div className="text-xs text-[#0f0f0f] truncate">
                    Ready: <span className="font-semibold">{displayNote}</span>
                  </div>
                )}
                {isDone && (
                  <div className="text-xs text-[#0f0f0f] truncate">
                    ✅ Range captured — you can head back to Training anytime.
                  </div>
                )}
                {error ? (
                  <span className="px-2 py-1 rounded border border-red-300 bg-red-50 text-red-700 text-xs">
                    {error}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* (Removed the extra hint row beneath the footer) */}
        </div>
      </div>
    </footer>
  );
}
