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
  /** If true, pick a random tonicPc from keys that fit saved range at session start. */
  randomTonic?: boolean;
};

/** Fields shared by all rhythm modes + UI/game toggles used by RhythmCard/TrainingGame */
type RhythmCommon = {
  available?: NoteValue[];
  restProb?: number;
  allowRests?: boolean;
  contentRestProb?: number;
  contentAllowRests?: boolean;
  lengthBars?: number;
  seed?: number;

  /** Show the blue rhythm guide line under the view */
  lineEnabled?: boolean;

  /** Enable camera-based rhythm detection */
  detectEnabled?: boolean;
};

export type RhythmConfig =
  | ({
      mode: "sequence";
      pattern: "asc" | "desc" | "asc-desc" | "desc-asc";
    } & RhythmCommon)
  | ({
      mode: "random";
    } & RhythmCommon)
  | ({
      mode: "interval";
      intervals: number[];
      numIntervals: number;
    } & RhythmCommon);

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

  callResponse: boolean;
  advancedMode: boolean;

  callResponseSequence: CRMode[];
  exerciseLoops: number;
  regenerateBetweenTakes: boolean;

  /** NEW: Looping mode (auto-continue after REST). */
  loopingMode: boolean;

  /** Absolute tonic(s) to anchor exercises (each T defines [T, T+12]). */
  tonicMidis?: number[] | null;

  /** Random mode — also allow notes below/above the selected windows. */
  randomIncludeUnder?: boolean;
  randomIncludeOver?: boolean;

  /**
   * NEW: Allowed scale-degree indices (0-based within the chosen scale).
   * If null/empty, all degrees in the scale are permitted.
   * Works across all octaves & keys.
   */
  allowedDegrees?: number[] | null;

  /**
   * LEGACY (no longer surfaced in UI): hard whitelist of *exact* MIDI notes.
   * If non-empty, still respected after degree/window filters.
   */
  allowedMidis?: number[] | null;

  /**
   * NEW: In random-key mode, prefer these 0-based octave indices (Octave 1 = index 0).
   * Multiple selections widen the usable range when the chosen key supports them.
   */
  preferredOctaveIndices?: number[] | null;

  /**
   * NEW: User-calibrated compute latency (ms) for hand-gesture → event timing.
   * We subtract this from MediaPipe timestamps to align with the musical transport.
   */
  gestureLatencyMs?: number;
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
    // Optional UI defaults (explicit for clarity; card also defaults these)
    lineEnabled: true,
    detectEnabled: true,
  },

  customPhrase: null,
  customWords: null,

  view: "piano",
  metronome: true,

  callResponse: true,
  advancedMode: false,

  callResponseSequence: [],
  exerciseLoops: 10,
  regenerateBetweenTakes: false,

  /** NEW default: auto-continue like today unless user turns it off in curriculum */
  loopingMode: true,

  tonicMidis: null,
  randomIncludeUnder: false,
  randomIncludeOver: false,

  allowedDegrees: null,   // ← all degrees allowed
  allowedMidis: null,     // ← legacy (UI removed)

  preferredOctaveIndices: [1], // default “Octave 2”

  /** NEW: hand-gesture timing compensation */
  gestureLatencyMs: 90,
};
