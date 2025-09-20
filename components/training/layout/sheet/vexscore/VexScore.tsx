// components/training/layout/sheet/vexscore/VexScore.tsx
"use client";
import React from "react";
import ScoreView from "./ScoreView";
import type { VexScoreProps } from "./types";

/** Thin wrapper to keep a stable default export */
export default function VexScore(props: VexScoreProps) {
  return <ScoreView {...props} />;
}
