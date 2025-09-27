// components/vision/stage/stage-layout/StageFooter.tsx
"use client";

import React from "react";

type Phase = "idle" | "lead" | "run" | "done";

type Props = {
  phase: Phase;
  runBeats: number;
  matched: number;
  resultMs: number | null;
  error: string | null;
  onReset: () => void;
};

export default function StageFooter({
  phase,
  runBeats,
  matched,
  resultMs,
  error,
  onReset,
}: Props) {
  return (
    <div className="absolute left-0 right-0 bottom-0 p-3 flex items-center justify-between text-xs text-white/80">
      <div className="opacity-80">
        {phase === "idle" && "Click anywhere to start · 4-beat lead-in, then 16 taps."}
        {phase === "lead" && "Lead-in…"}
        {phase === "run" && "Tap up on each beat (16 total)…"}
        {phase === "done" && (
          resultMs != null
            ? `Calibrated delay: ${resultMs} ms • matched beats: ${matched}/${runBeats}`
            : "No reliable matches — try again."
        )}
      </div>
      <div className="flex items-center gap-2">
        {phase === "done" ? (
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1.5 rounded-md bg-white/90 text-black hover:bg-white"
          >
            Run again
          </button>
        ) : null}
        {error ? (
          <span className="px-2 py-1 rounded bg-red-600/90 text-white">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
