// components/game-layout/stats/GameStats.tsx
"use client";
import React from "react";
import usePitchReadout from "@/hooks/pitch/usePitchReadout";

type CellProps = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  intent?: "default" | "error";
};
function StatCell({ label, value, mono, intent = "default" }: CellProps) {
  const errorClasses =
    intent === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-[#d2d2d2] bg-[#ebebeb] text-[#0f0f0f]";
  const labelClasses = intent === "error" ? "text-red-700" : "text-[#2d2d2d]";
  return (
    <div className={`rounded-md p-4 border ${errorClasses}`}>
      <div className={labelClasses}>{label}</div>
      <div className={`text-xl ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

type Props = {
  /** Inputs for readouts */
  livePitchHz?: number | null;
  isReady?: boolean;
  error?: string | null;

  confidence: number;
  /** Show “—” when confidence is below this threshold (defaults to 0.5) */
  confThreshold?: number;

  /** Optional layout/style overrides */
  className?: string;
};

export default function GameStats({
  livePitchHz,
  isReady = false,
  error,
  confidence,
  confThreshold = 0.5,
  className,
}: Props) {
  const { pitchText, noteText } = usePitchReadout({
    pitch: typeof livePitchHz === "number" ? livePitchHz : null,
    isReady,
    error,
    a4Hz: 440,
  });

  const confText = Number.isFinite(confidence) && confidence >= confThreshold ? confidence.toFixed(2) : "—";

  return (
    <div className={`w-full max-w-5xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm ${className ?? ""}`}>
      <StatCell label="Live Pitch" value={pitchText} mono />
      <StatCell label="Note (A440)" value={noteText} mono />
      <StatCell label="Confidence" value={confText} mono intent={error ? "error" : "default"} />
    </div>
  );
}
