// components/training/session/types.ts
import type { TimeSignature } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/stage";
import type { NoteValue } from "@/utils/time/tempo";
import type { ScaleName } from "@/utils/phrase/scales";

// ---- Call/Response modes ----
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
  randomTonic?: boolean;
};

/** Fields shared by all rhythm modes + UI/game toggles */
type RhythmCommon = {
  available?: NoteValue[];
  restProb?: number;
  allowRests?: boolean;
  contentRestProb?: number;
  contentAllowRests?: boolean;
  lengthBars?: number;
  seed?: number;
  lineEnabled?: boolean;
  detectEnabled?: boolean;
};

export type RhythmConfig =
  | ({ mode: "sequence"; pattern: "asc" | "desc" | "asc-desc" | "desc-asc" } & RhythmCommon)
  | ({ mode: "random" } & RhythmCommon)
  | ({ mode: "interval"; intervals: number[]; numIntervals: number } & RhythmCommon);

export type ViewMode = "piano" | "sheet" | "polar";

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

  /** Auto-continue after REST. */
  loopingMode: boolean;

  /**
   * Treat the whole record window as a single free-timing response.
   * Scoring ignores rhythmic alignment & bins; one score per take.
   */
  timingFreeResponse?: boolean;

  /**
   * OVERALL relaxed record-window cap (seconds).
   * Kept for backwards compat; courses already set this.
   */
  timingFreeMaxSec?: number;

  /**
   * NEW: Per-note hard cap (seconds). Default 5s.
   * Used by the capture controller to advance to the next expected note.
   */
  timingFreePerNoteMaxSec?: number;

  /**
   * Required consecutive detected/confident capture (seconds)
   * before we advance/end early in timing-free mode.
   */
  timingFreeMinCaptureSec?: number;

  /** Absolute tonic(s) to anchor exercises (each T defines [T, T+12]). */
  tonicMidis?: number[] | null;

  /** Include upper-most tonic window too (when available). */
  includeUpperTonic?: boolean;

  /** Random mode — also allow notes below/above the selected windows. */
  randomIncludeUnder?: boolean;
  randomIncludeOver?: boolean;

  /**
   * When true (default), treat each tonic window [T, T+12) as half-open
   * and drop the top-octave tonic (T+12) from random generation.
   * Set to false to allow the octave.
   */
  dropUpperWindowDegrees?: boolean;

  /** Allowed scale-degree indices (0-based) within the chosen scale. */
  allowedDegrees?: number[] | null;

  /** Legacy whitelist of exact MIDI notes (still respected if present). */
  allowedMidis?: number[] | null;

  /** Preferred 0-based octave indices in random-key mode. */
  preferredOctaveIndices?: number[] | null;

  /** User-calibrated compute latency (ms) for hand-gesture → event timing. */
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

  loopingMode: true,

  // Timing-free defaults
  timingFreeResponse: false,
  timingFreeMaxSec: 10,          // overall cap (kept)
  timingFreePerNoteMaxSec: 5,    // per-note cap (new)
  timingFreeMinCaptureSec: 1,

  tonicMidis: null,
  includeUpperTonic: true,
  randomIncludeUnder: false,
  randomIncludeOver: false,
  dropUpperWindowDegrees: true,

  allowedDegrees: null,
  allowedMidis: null,

  preferredOctaveIndices: [1],

  gestureLatencyMs: 90,
};
