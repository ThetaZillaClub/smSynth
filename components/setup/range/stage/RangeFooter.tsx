// components/range/stage/RangeFooter.tsx
"use client";

import React from "react";

type Step = "low" | "high";

export default function RangeFooter({
  step,
  progressPct,
  displayNote,
  hasCapture,
  isDone,
  error,
  onReset,
  onConfirm,
}: {
  step: Step;
  progressPct: number;           // 0..100 (visual only)
  displayNote: string | null;    // e.g. "C4 • 261.6 Hz"
  hasCapture: boolean;           // true when a note is captured and ready
  isDone: boolean;               // true after confirming the high note
  error: string | null;
  onReset: () => void;
  onConfirm: () => void;
}) {
  const label = isDone
    ? "Restart"
    : hasCapture
    ? "Confirm"
    : step === "low"
    ? "Sing & hold your lowest note…"
    : "Sing & hold your highest note…";

  const handleClick = () => {
    if (isDone) onReset();
    else if (hasCapture) onConfirm();
  };

  return (
    <footer className="w-full bg-transparent px-4 md:px-6 py-3">
      <div className="w-[90%] mx-auto">
        {/* lighter white card + soft shadow (matches Vision footer) */}
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
                    <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md bg-[#f4f4f4] text-[#0f0f0f] border border-[#dcdcdc] font-semibold">
                      {Math.round(progressPct)}%
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* center: rounded icon button (matches Vision footer height) */}
            <div className="justify-self-center">
              <button
                type="button"
                onClick={handleClick}
                aria-label={label}
                disabled={!isDone && !hasCapture}
                className="inline-flex items-center justify-center rounded-full p-3 bg-[#ebebeb] text-[#0f0f0f] hover:opacity-100 active:scale-[0.98] transition disabled:opacity-100 disabled:cursor-not-allowed"
              >
                {isDone ? (
                  // Restart icon
                  <svg viewBox="0 0 24 24" className="w-10 h-10" aria-hidden>
                    <path
                      d="M12 6a6 6 0 105.196 9.066l1.473 1.473A8 8 0 114 12h2a6 6 0 006-6V3l4 4-4 4V6z"
                      fill="currentColor"
                    />
                  </svg>
                ) : (
                  // Checkmark icon (used instead of the 'Confirm' text)
                  <svg viewBox="0 0 24 24" className="w-10 h-10" aria-hidden>
                    <path
                      d="M9 16.2L4.8 12l-1.4 1.4L9 19l12-12-1.4-1.4z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
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
        </div>
      </div>
    </footer>
  );
}
