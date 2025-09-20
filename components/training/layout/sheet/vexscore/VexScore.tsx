// components/training/layout/sheet/vexscore/VexScore.tsx
"use client";
import React from "react";
import ScoreView, { type VexScoreProps } from "./ScoreView";

/** Thin wrapper to keep a stable default export */
export default function VexScore(props: VexScoreProps) {
  return <ScoreView {...props} />;
}
