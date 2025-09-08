"use client";

import React from "react";
import StatCard from "./StatCard";

type Props = {
  pitchText: string;
  noteText: string;
  confidence: number;
};

export default function GameStats({ pitchText, noteText, confidence }: Props) {
  return (
    <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
      <StatCard label="Live Pitch" value={pitchText} mono />
      <StatCard label="Note (A440)" value={noteText} mono />
      <StatCard label="Confidence" value={confidence.toFixed(2)} mono />
    </div>
  );
}
