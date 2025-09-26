// components/training/session/types.ts
import type { TimeSignature } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/stage";
import type { NoteValue } from "@/utils/time/tempo";
import type { ScaleName } from "@/utils/phrase/scales";

// ---- NEW: Call/Response modes configuration ----
export type CRMode =
  | { kind: "single_tonic" }
  | { kind: "derived_tonic" }
  | { kind: "guided_arpeggio" }
  | { kind: "internal_arpeggio" };

export type LyricStrategy = "solfege";

export type ScaleConfig = {
  tonicPc: number;
  name: ScaleName;
  /** Random-mode cap: maximum consecutive hits per scale degree. Default: 2. */
  maxPerDegree?: number;
  seed?: number;
};

export type RhythmConfig =
  | {
      /** Step through a scale using a pattern (independent of rhythm line). */
      mode: "sequence";
      pattern: "asc" | "desc" | "asc-desc" | "desc-asc";
      /** Guide/line rests (blue line) */
      restProb?: number;
      allowRests?: boolean;
      /** Melody rests (content) */
      contentRestProb?: number;
      contentAllowRests?: boolean;
      /** Available rhythmic values */
      available?: NoteValue[];
      /** Bars to generate in random/line fabrics */
      lengthBars?: number;
      seed?: number;
    }
  | {
      /** Random note selection within scale + range */
      mode: "random";
      available?: NoteValue[];
      /** Guide/line rests (blue line) */
      restProb?: number;
      allowRests?: boolean;
      /** Melody rests (content) */
      contentRestProb?: number;
      contentAllowRests?: boolean;
      lengthBars?: number;
      seed?: number;
    }
  | {
      /** Interval training (now scale-aware + range/tonic-window driven) */
      mode: "interval";
      available?: NoteValue[];
      /** Guide/line rests (blue line) */
      restProb?: number;
      allowRests?: boolean;
      /** Melody rests (content) */
      contentRestProb?: number;
      contentAllowRests?: boolean;

      /**
       * Allowed interval sizes in semitones (e.g., 1, 2, 3, 5, 7, 12).
       * Pairs may be chosen ascending or descending; BOTH notes must be in the scale.
       */
      intervals: number[];

      /** How many interval pairs to generate. */
      numIntervals: number;

      seed?: number;
    };

export type ViewMode = "piano" | "sheet";

export type SessionConfig = {
  bpm: number;
  ts: TimeSignature;
  leadBars: number;
  restBars: number;
  exerciseBars: number;

  /** Legacy/simple generation controls */
  noteValue?: NoteValue;
  noteDurSec?: number;

  lyricStrategy: LyricStrategy;
  scale?: ScaleConfig;
  rhythm?: RhythmConfig;

  /** Optional overrides (skip generation entirely if provided) */
  customPhrase?: Phrase | null;
  customWords?: string[] | null;

  view: ViewMode;
  metronome: boolean;

  /** (legacy flag; pre-test is separate now) */
  callResponse: boolean;
  advancedMode: boolean;

  /** Ordered list of Call/Response modes to run once before the exercise */
  callResponseSequence: CRMode[];

  /** Number of exercise loops (takes) */
  exerciseLoops: number;

  /** If true, regenerate a new phrase between takes */
  regenerateBetweenTakes: boolean;

  /** Absolute tonic(s) to anchor exercises (each T defines [T, T+12]). */
  tonicMidis?: number[] | null;

  /** Random mode only — also allow notes *below the lowest* selected window. */
  randomIncludeUnder?: boolean;

  /** Random mode only — also allow notes *above the highest* selected window. */
  randomIncludeOver?: boolean;

  /**
   * Hard whitelist of *exact* MIDI notes allowed inside selected window(s).
   * If null/empty, we allow all scale notes in the eligible area.
   */
  allowedMidis?: number[] | null;
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  bpm: 80,
  ts: { num: 4, den: 4 },
  leadBars: 1,
  restBars: 1,
  exerciseBars: 2,

  noteValue: "quarter",
  noteDurSec: 0.5,

  lyricStrategy: "solfege",
  scale: { tonicPc: 0, name: "major", maxPerDegree: 2, seed: 0xC0FFEE },

  rhythm: {
    mode: "random",
    available: ["quarter"],
    restProb: 0.3,
    allowRests: true,
    contentRestProb: 0.3,
    contentAllowRests: true,
    lengthBars: 2,
    seed: 0xA5F3D7,
  },

  customPhrase: null,
  customWords: null,

  view: "piano",
  metronome: true,

  callResponse: true, // exercise playback does not use this anymore
  advancedMode: false,

  callResponseSequence: [],
  exerciseLoops: 24,
  regenerateBetweenTakes: false,

  tonicMidis: null,
  randomIncludeUnder: false,
  randomIncludeOver: false,
  allowedMidis: null,
};
