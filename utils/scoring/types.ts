// utils/scoring/types.ts
import type { Phrase } from "@/utils/stage";

export type PitchSample = { tSec: number; hz: number | null; conf: number };

// ---- Pitch ----
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

// ---- Rhythm ----
export type PerNoteRhythm = {
  idx: number;           // note index
  dur: number;           // evaluated duration (s)
  voicedSec: number;     // seconds voiced within window
  coverage: number;      // voicedSec / dur (0..1)
  onsetErrMs: number | null; // first voiced - notated onset (ms)
};

export type RhythmPerEvent = {
  idx: number;                 // expected beat index
  expSec: number;              // expected onset (s)
  tapSec: number | null;       // matched tap time (s) or null
  errMs: number | null;        // Δt in ms (tap - expected), null if none
  credit: number;              // 0..1 credit based on timing window
  hit: boolean;                // true if within maxAlignMs
};

export type RhythmEval = {
  pct: number;
  hitRate: number;
  meanAbs: number;
  evaluated: boolean;
  perEvent: RhythmPerEvent[];  // ⬅️ per-beat breakdown
};

export type RhythmScore = {
  melodyPercent: number;     // 0..100 (coverage-based)
  melodyHitRate: number;     // 0..1
  melodyMeanAbsMs: number;   // ms
  lineEvaluated: boolean;
  linePercent: number;
  lineHitRate: number;
  lineMeanAbsMs: number;
  combinedPercent: number;   // average of evaluated rhythm tracks
  perNoteMelody: PerNoteRhythm[]; // ⬅️ per-note coverage for melody
  linePerEvent: RhythmPerEvent[]; // ⬅️ per-beat table for rhythm line
};

// ---- Intervals ----
export type IntervalClass = {
  semitones: number;
  label: string;
  attempts: number;
  correct: number;
  percent: number;
};

export type IntervalScore = {
  total: number;
  correct: number;
  correctRatio: number;      // 0..1
  classes: IntervalClass[];
};

// ---- Final & take ----
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

// ---- Options / helpers ----
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
