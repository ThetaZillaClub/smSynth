"use client";

import type { TakeScore } from "@/utils/scoring/score";

function letterFromPct(p: number): string {
  if (p >= 90) return "A";
  if (p >= 80) return "B";
  if (p >= 70) return "C";
  if (p >= 60) return "D";
  return "F";
}

/** Same math as before, packaged for reuse. */
export function buildArpScore({
  rootHeldSec,
  rootRequiredSec,
  rootCents,
  arpCorrect,
  arpTotal,
}: {
  rootHeldSec: number;
  rootRequiredSec: number;
  rootCents: number | null;
  arpCorrect: number;
  arpTotal: number;
}): TakeScore {
  const rootHold = Math.max(0, Math.min(1, rootHeldSec / Math.max(0.001, rootRequiredSec)));
  const tol = 45;
  const abs = Math.abs(rootCents ?? 0);
  const withinTol = abs <= tol ? 1 : Math.max(0, 1 - (abs - tol) / 100);
  const pitchPct = Math.round((0.6 * rootHold + 0.4 * withinTol) * 1000) / 10;

  const intervalsRatio = arpTotal ? arpCorrect / arpTotal : 0;
  const rhythmPct = Math.round(intervalsRatio * 1000) / 10;

  const finalPct = Math.round(((pitchPct + rhythmPct) / 2) * 10) / 10;

  return {
    final: { percent: finalPct, letter: letterFromPct(finalPct) },
    pitch: { percent: pitchPct, timeOnPitchRatio: rootHold, centsMae: Math.round(abs) },
    rhythm: {
      melodyPercent: rhythmPct,
      melodyHitRate: intervalsRatio,
      melodyMeanAbsMs: 80,
      combinedPercent: rhythmPct,
      lineEvaluated: false,
      linePercent: 0,
      lineHitRate: 0,
      lineMeanAbsMs: 0,
    },
    intervals: { correct: arpCorrect, total: arpTotal, correctRatio: intervalsRatio },
  } as unknown as TakeScore;
}
