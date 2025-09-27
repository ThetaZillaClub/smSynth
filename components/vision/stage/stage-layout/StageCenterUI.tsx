// components/vision/stage/stage-layout/StageCenterUI.tsx
"use client";

import React from "react";

type Phase = "idle" | "lead" | "run" | "done";

type Props = {
  phase: Phase;
  uiBeat: number;
  onStart: () => void;
};

export default function StageCenterUI({ phase, uiBeat, onStart }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {phase === "idle" ? (
        <button
          type="button"
          onClick={onStart}
          className="px-4 py-2 rounded-md bg-white/90 text-black text-sm font-semibold hover:bg-white"
          title="Start calibration"
        >
          Start calibration
        </button>
      ) : phase === "lead" ? (
        <div className="text-white/95 text-6xl font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          {uiBeat}
        </div>
      ) : phase === "run" ? (
        <div className="text-white/90 text-5xl font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          {uiBeat}
        </div>
      ) : null}
    </div>
  );
}
