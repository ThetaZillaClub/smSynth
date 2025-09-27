"use client";

import type { TakeScore } from "@/utils/scoring/score";

function letterFromPct(p: number): string {
  if (p >= 90) return "A";
  if (p >= 80) return "B";
  if (p >= 70) return "C";
  if (p >= 60) return "D";
  return "F";
}

/** Same math you had, wrapped for reuse. */
export function buildSustainScore({
  heldSec,
  requiredHoldSec,
  lastCents,
  passed,
}: {
  heldSec: number;
  requiredHoldSec: number;
  lastCents: number | null;
  passed: boolean;
}): TakeScore {
  const holdRatio = Math.max(0, Math.min(1, heldSec / Math.max(0.001, requiredHoldSec)));
  const tol = 50;
  const abs = Math.abs(lastCents ?? 0);
  const withinTol = abs <= tol ? 1 : Math.max(0, 1 - (abs - tol) / 100);
  const pitchPct = Math.round((0.7 * holdRatio + 0.3 * withinTol) * 1000) / 10;
  const finalPct = Math.max(pitchPct, passed ? Math.max(pitchPct, 60) : pitchPct);

  return {
    final: { percent: finalPct, letter: letterFromPct(finalPct) },
    pitch: { percent: pitchPct, timeOnPitchRatio: holdRatio, centsMae: Math.round(abs) },
    rhythm: {
      melodyPercent: 100,
      melodyHitRate: 1,
      melodyMeanAbsMs: 80,
      combinedPercent: 100,
      lineEvaluated: false,
      linePercent: 0,
      lineHitRate: 0,
      lineMeanAbsMs: 0,
    },
    intervals: { correct: 1, total: 1, correctRatio: 1 },
  } as unknown as TakeScore;
}
