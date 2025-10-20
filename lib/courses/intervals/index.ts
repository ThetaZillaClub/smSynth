// lib/courses/intervals/index.ts
import type { CourseDef } from "../types";
import type { SessionConfig } from "@/components/training/session/types";

/**
 * Intervals (new):
 * - Game/view like Pitch-Tune (polar view, free response, bpm 120)
 * - Random mode, 1 bar of HALF notes
 * - No rests, no rhythm line, no detection
 * - Chromatic scale; each lesson limits the pool to the two degrees that form the target interval.
 *   With 1 bar of half notes, you’ll sing two notes per take → an interval.
 */

const BASE: Partial<SessionConfig> = {
  bpm: 120,                 // same as Pitch-Tune
  view: "polar",            // Polar-Tune view
  metronome: true,
  callResponse: true,       // same interaction model as Pitch-Tune
  exerciseLoops: 4,
  regenerateBetweenTakes: true,

  // Free-response like Pitch-Tune
  timingFreeResponse: true,
  timingFreeMaxSec: 10,
  timingFreeMinCaptureSec: 1,

  // Chromatic so semitone/tritone lessons work; tonicPc is user-adjustable at runtime
  scale: { name: "chromatic", tonicPc: 0 },

  // Random mode rhythm: exactly 1 bar, HALF notes only (→ two notes per take), no rests/line/detect
  rhythm: {
    mode: "random",
    available: ["half"],
    lengthBars: 1,

    // Blue-line UI + rest knobs (extras; keep `as any`)
    lineEnabled: false,
    detectEnabled: false,
    allowRests: false,
    restProb: 0,
    contentAllowRests: false,
    contentRestProb: 0,
  } as any,
};

// helper to keep lessons concise
// - `allowedDegrees` are chromatic semitone offsets from tonic: 0..11
//   e.g., [0,2] = do & re (M2), [0,1] = do & ra/di (m2), [0] = do only (octave).
const mk = (
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
  } as Partial<SessionConfig>,
});

const INTERVALS_COURSE: CourseDef = {
  slug: "intervals",
  title: "Intervals",
  subtitle: "Intervals on Polar Tune (free response, random mode)",
  lessons: [
    // ===== MAJOR INTERVALS FIRST =====
    mk(
      [0, 2],
      "Major 2nd — do→re",
      "major-2nd-deg-1-2",
      "Whole step (2): bright neighbor motion — do–re, re–mi, la–ti."
    ),
    mk(
      [0, 4],
      "Major 3rd — do→mi",
      "major-3rd-deg-1-3",
      "Four semitones: open & sunny — do–mi / fa–la. Clear, ringing color."
    ),
    mk(
      [0, 9],
      "Major 6th — do→la",
      "major-6th-deg-1-6",
      "Nine semitones: expansive lift — do–la. Warm, lyrical leap."
    ),
    mk(
      [0, 11],
      "Major 7th — do→ti",
      "major-7th-deg-1-7",
      "Eleven semitones: leading-tone pull — do–ti. Tense, reaching color."
    ),

    // ===== THEN THE MINOR INTERVALS =====
    mk(
      [0, 1],
      "Minor 2nd — do→ra (or ti→do ↓)",
      "minor-2nd-deg-1-2",
      "Semitone (1): close, spicy tension — do–ra up; classic descent ti–do."
    ),
    mk(
      [0, 3],
      "Minor 3rd — do→me",
      "minor-3rd-deg-1-3",
      "Three semitones: soulful shade — do–me / la–do. Expressive, vocal."
    ),
    mk(
      [0, 8],
      "Minor 6th — do→le",
      "minor-6th-deg-1-6",
      "Eight semitones: bittersweet distance — do–le. Yearning leap."
    ),
    mk(
      [0, 10],
      "Minor 7th — do→te",
      "minor-7th-deg-1-7",
      "Ten semitones: bluesy pull — do–te. Strong away-from-home feel."
    ),

    // ===== PERFECTS, TRITONE, OCTAVE =====
    mk(
      [0, 5],
      "Perfect 4th — do→fa",
      "perfect-4th-deg-1-4",
      "Five semitones: solid pillar — do–fa. Grounded, stable sonority."
    ),
    mk(
      [0, 7],
      "Perfect 5th — do→sol",
      "perfect-5th-deg-1-5",
      "Seven semitones: open resonance — do–sol. Classic perfect span."
    ),
    mk(
      [0, 6],
      "Tritone — do→fi / fa→ti",
      "tritone-deg-1-sharp4",
      "Six semitones: restless & bright — do–fi (aug4) or fa–ti (dim5). Wants to resolve."
    ),
    mk(
      [0],
      "Octave — do→do",
      "octave-deg-1-8",
      "Twelve semitones: same home, higher — do–do. Complete and calm."
    ),
  ],
};

export default INTERVALS_COURSE;
