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
import { finalizeScore } from "./final/finalize";

export type { PitchSample, TakeScore } from "./types";

export function computeTakeScore({
  phrase,
  bpm, den, // den reserved
  samples,
  gestureEventsSec,
  melodyOnsetsSec,
  rhythmLineOnsetsSec,
  options = {},
}: ComputeTakeScoreArgs): TakeScore {
  const {
    confMin = 0,
    centsOk = 50,
    onsetGraceMs = 120,
    maxAlignMs = 250,
    goodAlignMs = 120,
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

  // ---- Intervals ----
  const voiced: PitchSample[] = filterVoiced(samples, confMin);
  const intervals = computeIntervalScore(phrase, voiced);

  // ---- Finalize ----
  const final = finalizeScore(pitch.percent, rhythm.combinedPercent);

  return { pitch, rhythm, intervals, final };
}
