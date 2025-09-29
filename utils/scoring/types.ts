// utils/scoring/types.ts
import type { Phrase } from "@/utils/stage";

export type PitchSample = { tSec: number; hz: number | null; conf: number };

export type PerNotePitch = {
  idx: number;
  timeOnPitch: number;
  dur: number;
  ratio: number;
  centsMae: number;
};

export type PitchScore = {
  percent: number;           // 0..100
  timeOnPitchRatio: number;  // 0..1
  centsMae: number;          // mean absolute cents (voiced)
  perNote: PerNotePitch[];
};

export type RhythmScore = {
  melodyPercent: number;     // 0..100 (coverage-based)
  melodyHitRate: number;     // 0..1 (any voicing in window)
  melodyMeanAbsMs: number;   // first voiced vs. notated onset
  lineEvaluated: boolean;
  linePercent: number;
  lineHitRate: number;
  lineMeanAbsMs: number;
  combinedPercent: number;   // average of evaluated rhythm tracks
};

export type IntervalScore = {
  total: number;
  correct: number;
  correctRatio: number;      // 0..1
};

export type FinalScore = {
  percent: number;           // 0..100
  letter: string;
};

export type TakeScore = {
  pitch: PitchScore;
  rhythm: RhythmScore;
  intervals: IntervalScore;
  final: FinalScore;
};

export type Options = {
  /** Optional extra confidence gate during scoring. Default 0. */
  confMin?: number;
  /** Cents window for "on pitch". Default 50. */
  centsOk?: number;
  /** Ignored time at head of each note for eval/coverage. Default 120ms. */
  onsetGraceMs?: number;
  /** Max alignment window (ms). Default 250ms. */
  maxAlignMs?: number;
  /** Full credit inside this band; smooth falloff to maxAlignMs. Default 120ms. */
  goodAlignMs?: number;
};

export type RhythmEval = {
  pct: number;
  hitRate: number;
  meanAbs: number;
  evaluated: boolean;
};

export type ComputeTakeScoreArgs = {
  phrase: Phrase;
  bpm: number;
  den: number; // reserved
  samples: PitchSample[];
  gestureEventsSec: number[];
  melodyOnsetsSec: number[];
  rhythmLineOnsetsSec?: number[];
  options?: Options;
};
