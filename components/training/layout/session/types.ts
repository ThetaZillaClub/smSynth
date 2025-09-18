// components/training/layout/session/types.ts
// ---------------------------------------------------
import type { TimeSignature } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/piano-roll/scale";
import type { NoteValue } from "@/utils/time/tempo";
import type { ScaleName } from "@/utils/phrase/scales";

// Only solfege is supported now; keep the field for forwards-compat
export type LyricStrategy = "solfege";

/** Optional scale config for generated exercises */
export type ScaleConfig = {
  tonicPc: number;        // 0..11
  name: ScaleName;
  maxPerDegree?: number;  // used by "random" phrase builder, default 2
  seed?: number;
};

/** Rhythm/Content config */
export type RhythmConfig =
  | {
      mode: "sequence";
      /** Sequence pattern */
      pattern: "asc" | "desc" | "asc-desc" | "desc-asc";
      /** Optional seed to pick starting register */
      seed?: number;
      /** Rest density in sequence mapping (applies to rhythm fabric below) */
      restProb?: number;          // default 0.3
      /** Hard switch to allow (true) or forbid (false) rests entirely */
      allowRests?: boolean;       // default true
      /** Available note lengths to compose the rhythm fabric (default ["quarter"]) */
      available?: NoteValue[];
    }
  | {
      mode: "random";
      /** Available note lengths (default ["quarter"]) */
      available?: NoteValue[];
      /** Rest density (default 0.3) */
      restProb?: number;
      /** Hard switch to allow (true) or forbid (false) rests entirely */
      allowRests?: boolean;       // default true
      /** Seed */
      seed?: number;
    };

export type SessionConfig = {
  bpm: number;
  ts: TimeSignature;

  /** Lead-in length in bars */
  leadBars: number;

  /** Musical rest between takes in bars */
  restBars: number;

  /** Legacy transport helper (still used for some UIs) */
  noteValue?: NoteValue;
  noteDurSec?: number;

  lyricStrategy: LyricStrategy; // always "solfege"

  /** Optional scale-based generator config */
  scale?: ScaleConfig;

  /** Sequence/random config */
  rhythm?: RhythmConfig;

  // Optional overrides
  customPhrase?: Phrase | null;
  customWords?: string[] | null;
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  bpm: 80,
  ts: { num: 4, den: 4 },
  leadBars: 1,
  restBars: 1,
  noteValue: "quarter",
  noteDurSec: 0.5,
  lyricStrategy: "solfege",
  scale: { tonicPc: 0, name: "major", maxPerDegree: 2, seed: 0xC0FFEE },
  rhythm: { mode: "random", available: ["quarter"], restProb: 0.3, allowRests: true, seed: 0xA5F3D7 },
  customPhrase: null,
  customWords: null,
};
