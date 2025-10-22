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
import { finalizeScore } from "./final/finalize"; // ⬅️ use harmonic mean

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
  } = options;

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
  });

  // ---- Intervals (same centsOk behavior) ----
  const voiced: PitchSample[] = filterVoiced(samples, confMin);
  const intervals = computeIntervalScore(phrase, voiced, centsOk);

  // ---- Finalize via harmonic mean (pitch ⨉ rhythm) ----
  const rhythmPctForFinal = rhythm.combinedPercent; // melody-only or avg with line
  const final = finalizeScore(pitch.percent, rhythmPctForFinal);

  return { pitch, rhythm, intervals, final };
}
