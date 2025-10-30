// utils/scoring/final/finalize.ts
import { letterFromPercent } from "../grade";
import type { FinalScore, TakeScore } from "../types";

/**
 * Pairwise harmonic mean (legacy two-metric API).
 * If either input is <= 0, returns the other (max).
 * Perfect rounding: if both >= 98 → 100.
 */
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
 * n-ary harmonic mean over any number of components (percent scale).
 * - Ignores non-positive/NaN components.
 * - If none are valid, returns 0.
 * - If all valid components are >= 98, snaps to 100.
 */
export function finalizeScoreN(...percents: number[]): FinalScore {
  const xs = percents.filter((p) => Number.isFinite(p) && p > 0);
  if (!xs.length) return { percent: 0, letter: letterFromPercent(0) };

  if (xs.every((p) => p >= 98)) {
    return { percent: 100, letter: letterFromPercent(100) };
  }

  const n = xs.length;
  const sumRecip = xs.reduce((a, p) => a + 1 / Math.max(1e-9, p), 0);
  const hm = Math.max(0, Math.min(100, n / sumRecip));
  return { percent: hm, letter: letterFromPercent(hm) };
}

/**
 * Visibility-aware final score with NO pre-combining:
 * harmonic mean over pitch + (melody rhythm if visible) + (line rhythm if visible & evaluated).
 */
export function finalizeVisible(
  take: Pick<TakeScore, "pitch" | "rhythm">,
  visibility?: { showMelodyRhythm?: boolean; showRhythmLine?: boolean }
): FinalScore {
  const parts: number[] = [take.pitch.percent];

  const includeMelody = visibility?.showMelodyRhythm !== false; // default include
  const includeLine   = visibility?.showRhythmLine   !== false; // default include

  if (includeMelody) parts.push(take.rhythm.melodyPercent);
  if (includeLine && take.rhythm.lineEvaluated) parts.push(take.rhythm.linePercent);

  return finalizeScoreN(...parts);
}
