// components/training/layout/session/types.ts
import type { TimeSignature } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/piano-roll/scale";
import type { NoteValue } from "@/utils/time/tempo";
import type { ScaleName } from "@/utils/phrase/scales";

export type LyricStrategy = "solfege";

export type ScaleConfig = {
  tonicPc: number;
  name: ScaleName;
  maxPerDegree?: number;
  seed?: number; // kept for compatibility (not shown in UI)
};

export type RhythmConfig =
  | {
      mode: "sequence";
      pattern: "asc" | "desc" | "asc-desc" | "desc-asc";
      /** Rhythm line (blue) rest controls */
      restProb?: number;
      allowRests?: boolean;
      /** Phrase (scale content) rest controls */
      contentRestProb?: number;
      contentAllowRests?: boolean;
      /** Shared pool of note values */
      available?: NoteValue[];
      /** Random/legacy length (used when switching back to random) */
      lengthBars?: number;
      /** legacy seed fields (not surfaced in UI) */
      seed?: number;
    }
  | {
      mode: "random";
      available?: NoteValue[];
      restProb?: number;
      allowRests?: boolean;
      /** Phrase (scale content) rest controls */
      contentRestProb?: number;
      contentAllowRests?: boolean;
      /** Exercise length in bars (now lives on rhythm) */
      lengthBars?: number;
      seed?: number;
    };

export type ViewMode = "piano" | "sheet";

export type SessionConfig = {
  bpm: number;
  ts: TimeSignature;
  /** Count-in, in bars */
  leadBars: number;
  /** Rest between takes, in bars */
  restBars: number;
  /** DEPRECATED (UI moved to rhythm.lengthBars): exercise length, in whole bars */
  exerciseBars: number;
  noteValue?: NoteValue;
  noteDurSec?: number;
  lyricStrategy: "solfege";
  scale?: ScaleConfig;
  rhythm?: RhythmConfig;
  customPhrase?: Phrase | null;
  customWords?: string[] | null;
  /** session view mode */
  view: ViewMode;
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  bpm: 80,
  ts: { num: 4, den: 4 },
  leadBars: 1,
  restBars: 1,
  exerciseBars: 2, // legacy default for backwards compatibility
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
    lengthBars: 2, // NEW canonical source for exercise length
    seed: 0xA5F3D7,
  },
  customPhrase: null,
  customWords: null,
  view: "piano",
};
