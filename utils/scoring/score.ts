// utils/scoring/score.ts
import { filterVoiced } from "./helpers";
import type {
  ComputeTakeScoreArgs,
  Options,
  PitchSample,
  TakeScore,
} from "./types";
import { letterFromPercent } from "./grade";
import { computePitchScore } from "./pitch/computePitch";
import { computeRhythmScore } from "./rhythm";
import { computeIntervalScore } from "./intervals/computeIntervals";

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
const parts: number[] = [pitch.percent, rhythm.melodyPercent];
if (rhythm.lineEvaluated) parts.push(rhythm.linePercent);

const finalPctRaw = parts.reduce((a, b) => a + b, 0) / parts.length;
const finalPct = Math.max(0, Math.min(100, finalPctRaw));

const final = {
  percent: finalPct,
  letter: letterFromPercent(finalPct),
};
  return { pitch, rhythm, intervals, final };
}
