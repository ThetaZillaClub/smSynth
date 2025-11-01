// utils/scoring/score.ts
import { filterVoiced } from "./helpers";
import type {
  ComputeTakeScoreArgs,
  Options,
  PitchSample,
  TakeScore,
} from "./types";
import { computePitchScore } from "./pitch/computePitch";
import { computeRhythmScore } from "./rhythm";
import { computeIntervalScore } from "./intervals/computeIntervals";
import { finalizeScoreN } from "./final/finalize"; // n-ary harmonic mean

export type { PitchSample, TakeScore } from "./types";

export function computeTakeScore({
  phrase,
  bpm, den,
  samples,
  gestureEventsSec,
  melodyOnsetsSec,
  rhythmLineOnsetsSec,
  options = {},
}: ComputeTakeScoreArgs): TakeScore {
  const {
    confMin = 0.5,
    centsOk = 60,
    onsetGraceMs = 120,
    maxAlignMs = 300,
    goodAlignMs = 150,
    // NEW: default to evaluating melody rhythm unless explicitly disabled by caller
    evaluateMelodyRhythm = true,
  } = options as Options & { evaluateMelodyRhythm?: boolean };

  // ---- Pitch ----
  const pitch = computePitchScore(phrase, samples, { confMin, centsOk, onsetGraceMs });

  // ---- Rhythm ----
  const rhythm = computeRhythmScore({
    phrase,
    samples,
    gestureEventsSec,
    melodyOnsetsSec,
    rhythmLineOnsetsSec,
    options: { confMin, onsetGraceMs, maxAlignMs, goodAlignMs },
    evaluateMelody: !!evaluateMelodyRhythm,
  });

  // ---- Intervals (same centsOk behavior) ----
  const voiced: PitchSample[] = filterVoiced(samples, confMin);
  const intervals = computeIntervalScore(phrase, voiced, centsOk);

  // ---- Finalize via harmonic mean over available components (no pre-combining) ----
  const parts: number[] = [pitch.percent];
  if (evaluateMelodyRhythm) parts.push(rhythm.melodyPercent);
  if (rhythm.lineEvaluated) parts.push(rhythm.linePercent);
  const final = finalizeScoreN(...parts);

  return { pitch, rhythm, intervals, final };
}
