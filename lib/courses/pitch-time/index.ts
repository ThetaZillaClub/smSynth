// lib/courses/pitch-time/index.ts
import type { CourseDef } from "../types";
import type { NoteValue } from "@/utils/time/tempo";
import type {
  SessionConfig,
  CRMode,
  RhythmConfig,
} from "@/components/training/session/types";

// Shared (non-rhythm) config:
// - bpm 80 (default), metronome on
// - takes = 4, regenerate between takes = on
// - Pretest: Single Pitch
// - Key/view/looping are client-set; we don't force them here.
// - Chromatic so every semitone is available (m2, tritone, etc.)
const BASE: Partial<SessionConfig> = {
  metronome: true,
  exerciseLoops: 4,
  regenerateBetweenTakes: true,
  callResponseSequence: [{ kind: "single_tonic" }] as CRMode[],
  scale: { name: "chromatic", tonicPc: 0 }, // client can change tonicPc
};

// Strictly-typed interval rhythm base so `numIntervals` is always present
const INTERVAL_BASE: Extract<RhythmConfig, { mode: "interval" }> = {
  mode: "interval",
  intervals: [], // overridden per-lesson
  numIntervals: 5, // “number of intervals: 5”
  available: ["quarter"] as NoteValue[],
  lineEnabled: false, // Rhythm Line: Hidden
  detectEnabled: false, // Rhythm Detection: Off
};

// helper: keep lessons concise
// - `allowedDegrees` indexes are chromatic semitone offsets from tonic: 0..11
//   e.g., [0,2] = do & re (M2), [0,1] = do & ra/di (m2), [0] = do only (octave).
const mk = (
  intervals: number[],
  allowedDegrees: number[],
  title: string,
  slug: string,
  summary: string
) => ({
  slug,
  title,
  summary,
  config: {
    ...BASE,
    allowedDegrees,
    rhythm: { ...INTERVAL_BASE, intervals },
  } as Partial<SessionConfig>,
});

const PITCH_TIME_COURSE: CourseDef = {
  slug: "pitch-time",
  title: "Pitch Time",
  subtitle: "Sing intervals with movable-do (chromatic solfège)",
  lessons: [
    // ===== MAJOR INTERVALS FIRST =====
    mk(
      [2],
      [0, 2],
      "Major 2nd — do→re",
      "major-2nd-deg-1-2",
      "Whole step (2): bright neighbor motion — do–re, re–mi, la–ti."
    ),
    mk(
      [4],
      [0, 4],
      "Major 3rd — do→mi",
      "major-3rd-deg-1-3",
      "Four semitones: open & sunny — do–mi / fa–la. Clear, ringing color."
    ),
    mk(
      [9],
      [0, 9],
      "Major 6th — do→la",
      "major-6th-deg-1-6",
      "Nine semitones: expansive lift — do–la. Warm, lyrical leap."
    ),
    mk(
      [11],
      [0, 11],
      "Major 7th — do→ti",
      "major-7th-deg-1-7",
      "Eleven semitones: leading-tone pull — do–ti. Tense, reaching color."
    ),

    // ===== THEN THE MINOR INTERVALS =====
    mk(
      [1],
      [0, 1],
      "Minor 2nd — do→ra (or ti→do ↓)",
      "minor-2nd-deg-1-2",
      "Semitone (1): close, spicy tension — do–ra up; classic descent ti–do."
    ),
    mk(
      [3],
      [0, 3],
      "Minor 3rd — do→me",
      "minor-3rd-deg-1-3",
      "Three semitones: soulful shade — do–me / la–do. Expressive, vocal."
    ),
    mk(
      [8],
      [0, 8],
      "Minor 6th — do→le",
      "minor-6th-deg-1-6",
      "Eight semitones: bittersweet distance — do–le. Yearning leap."
    ),
    mk(
      [10],
      [0, 10],
      "Minor 7th — do→te",
      "minor-7th-deg-1-7",
      "Ten semitones: bluesy pull — do–te. Strong away-from-home feel."
    ),

    // ===== PERFECTS, TRITONE, OCTAVE =====
    mk(
      [5],
      [0, 5],
      "Perfect 4th — do→fa",
      "perfect-4th-deg-1-4",
      "Five semitones: solid pillar — do–fa. Grounded, stable sonority."
    ),
    mk(
      [7],
      [0, 7],
      "Perfect 5th — do→sol",
      "perfect-5th-deg-1-5",
      "Seven semitones: open resonance — do–sol. Classic perfect span."
    ),
    mk(
      [6],
      [0, 6],
      "Tritone — do→fi / fa→ti",
      "tritone-deg-1-sharp4",
      "Six semitones: restless & bright — do–fi (aug4) or fa–ti (dim5). Wants to resolve."
    ),
    mk(
      [12],
      [0],
      "Octave — do→do",
      "octave-deg-1-8",
      "Twelve semitones: same home, higher — do–do. Complete and calm."
    ),
  ],
};

export default PITCH_TIME_COURSE;
