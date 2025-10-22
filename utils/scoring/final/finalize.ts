// utils/scoring/final/finalize.ts
import { letterFromPercent } from "../grade";
import type { FinalScore, RhythmScore, TakeScore } from "../types";

export function finalizeScore(pitchPercent: number, rhythmPercent: number): FinalScore {
  let finalPct =
    (pitchPercent > 0 && rhythmPercent > 0)
      ? (2 * pitchPercent * rhythmPercent) / (pitchPercent + rhythmPercent)
      : Math.max(pitchPercent, rhythmPercent);

  if (pitchPercent >= 98 && rhythmPercent >= 98) finalPct = 100;

  const clamped = Math.max(0, Math.min(100, finalPct));
  return {
    percent: clamped,
    letter: letterFromPercent(clamped),
  };
}

/**
 * Visibility-aware rhythm combiner.
 * Only averages the rhythm tracks that are currently visible.
 * If none are visible, returns 0.
 */
export function combinedRhythmPercentVisible(
  rhythm: RhythmScore,
  visibility?: { showMelodyRhythm?: boolean; showRhythmLine?: boolean }
): number {
  const useMelody = visibility?.showMelodyRhythm !== false;   // default: include
  const useLine   = visibility?.showRhythmLine   !== false;   // default: include

  const parts: number[] = [];
  if (useMelody) parts.push(rhythm.melodyPercent);
  if (useLine && rhythm.lineEvaluated) parts.push(rhythm.linePercent);

  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
}

/**
 * Visibility-aware final score.
 * Uses pitch percent vs. the visibility-filtered rhythm percent.
 */
export function finalizeVisible(
  take: Pick<TakeScore, "pitch" | "rhythm">,
  visibility?: { showMelodyRhythm?: boolean; showRhythmLine?: boolean }
): FinalScore {
  const rh = combinedRhythmPercentVisible(take.rhythm, visibility);
  return finalizeScore(take.pitch.percent, rh);
}
