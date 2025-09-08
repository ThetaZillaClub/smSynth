"use client";

import React from "react";
import StatCard from "./StatCard";

type Props = {
  pitchText: string;
  noteText: string;
  confidence: number;
  /** Show “—” when confidence is below this threshold (defaults to 0.5) */
  confThreshold?: number;
};

export default function GameStats({
  pitchText,
  noteText,
  confidence,
  confThreshold = 0.5,
}: Props) {
  const confText = confidence >= confThreshold ? confidence.toFixed(2) : "—";

  return (
    <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
      <StatCard label="Live Pitch" value={pitchText} mono />
      <StatCard label="Note (A440)" value={noteText} mono />
      <StatCard label="Confidence" value={confText} mono />
    </div>
  );
}
