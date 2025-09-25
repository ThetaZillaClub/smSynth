// components/training/session/types.ts
import type { TimeSignature } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/stage";
import type { NoteValue } from "@/utils/time/tempo";
import type { ScaleName } from "@/utils/phrase/scales";
import type { RootPreference } from "@/utils/phrase/generator";

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
  maxPerDegree?: number;
  seed?: number;
};
export type RhythmConfig =
  | {
      mode: "sequence";
      pattern: "asc" | "desc" | "asc-desc" | "desc-asc";
      restProb?: number;
      allowRests?: boolean;
      contentRestProb?: number;
      contentAllowRests?: boolean;
      available?: NoteValue[];
      lengthBars?: number;
      seed?: number;
    }
  | {
      mode: "random";
      available?: NoteValue[];
      restProb?: number;
      allowRests?: boolean;
      contentRestProb?: number;
      contentAllowRests?: boolean;
      lengthBars?: number;
      seed?: number;
    }
  | {
      mode: "interval";
      available?: NoteValue[];
      restProb?: number;
      allowRests?: boolean;
      contentRestProb?: number;
      contentAllowRests?: boolean;
      intervals: number[];
      octaves: number;
      preference: RootPreference;
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
  noteValue?: NoteValue;
  noteDurSec?: number;
  lyricStrategy: LyricStrategy;
  scale?: ScaleConfig;
  rhythm?: RhythmConfig;
  customPhrase?: Phrase | null;
  customWords?: string[] | null;
  view: ViewMode;
  metronome: boolean;

  /** (legacy flag; pre-test is separate now) */
  callResponse: boolean;
  advancedMode: boolean;

  /** NEW: ordered list of Call/Response modes to run once before the exercise */
  callResponseSequence: CRMode[];

  /** NEW: number of exercise loops (takes) */
  exerciseLoops: number;

  /** NEW: if true, regenerate a new phrase between takes */
  regenerateBetweenTakes: boolean;
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

  callResponseSequence: [],          // no defaults: user chooses
  exerciseLoops: 24,                 // 24 takes
  regenerateBetweenTakes: false,     // optional
};
