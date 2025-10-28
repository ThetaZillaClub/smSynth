// lib/courses/scales/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";
import type { NoteValue } from "@/utils/time/tempo";

// Shared “no rests” for both blue line and melody content.
const RHYTHM_FLAGS = {
  allowRests: false,
  restProb: 0,
  contentAllowRests: false,
  contentRestProb: 0,
  lineEnabled: true,
  detectEnabled: true,
} as const;

// Common availability used by most lessons
const QTR_ONLY = ["quarter"] as NoteValue[];

/** Course-wide defaults — rhythm stays out (because lessons mix modes). */
const BASE: Partial<SessionConfig> = {
  bpm: 70,
  exerciseLoops: 4,
  callResponseSequence: [{ kind: "single_tonic" }, { kind: "guided_arpeggio" }],
  preferredOctaveIndices: [1], // “middle” octave window when available
  // (No `rhythm` here — union requires `mode`, and lessons use different modes.)
};

export default defineCourse({
  slug: "scales",
  title: "Scales",
  subtitle: "Within-key scale work",
  base: BASE,
  lessons: [
    {
      slug: "major-one-octave-middle-2-bars",
      title: "Major — 1 octave (middle), 2 bars",
      summary: "Straight quarter notes, no rests.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        rhythm: {
          ...RHYTHM_FLAGS,
          mode: "sequence",
          pattern: "asc-desc",
          available: QTR_ONLY,
        },
        loopingMode: true,
      },
    },
    {
      slug: "major-random-key-oct2-2-bars",
      title: "Major — random key (Octave 2), 2 bars",
      summary: "Random key per launch; centered in Octave 2 if available.",
      overrides: {
        scale: { name: "major", tonicPc: 0, randomTonic: true },
        rhythm: {
          ...RHYTHM_FLAGS,
          mode: "random",
          available: QTR_ONLY,
        },
      },
    },
    {
      slug: "natural-minor-one-octave-middle-2-bars",
      title: "Natural minor — 1 octave (middle), 2 bars",
      summary: "Natural minor in the comfortable window.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 9, randomTonic: true },
        rhythm: {
          ...RHYTHM_FLAGS,
          mode: "sequence",
          pattern: "asc-desc",
          available: QTR_ONLY,
        },
      },
    },
    {
      slug: "major-135-degree-focus-2-bars",
      title: "Major — 1-3-5 focus, 2 bars",
      summary: "Targets tonic/third/fifth only.",
      overrides: {
        scale: { name: "major", tonicPc: 7 },
        allowedDegrees: [0, 2, 4],
        rhythm: {
          ...RHYTHM_FLAGS,
          mode: "random",
          available: QTR_ONLY,
        },
      },
    },
    {
      slug: "major-eighths-syncopated-2-bars",
      title: "Major — syncopated eighths, 2 bars",
      summary: "Eighth-note syncopation; rhythm line enabled.",
      overrides: {
        scale: { name: "major", tonicPc: 0, randomTonic: true },
        rhythm: {
          ...RHYTHM_FLAGS,
          mode: "random",
          available: ["eighth", "quarter"] as NoteValue[],
        },
      },
    },
    {
      slug: "intervals-m3-M3-P5",
      title: "Intervals — m3/M3/P5 targets",
      summary: "Interval drill inside a key.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        rhythm: {
          ...RHYTHM_FLAGS,
          mode: "interval",
          intervals: [3, 4, 7, 12],
          numIntervals: 8,
          available: QTR_ONLY,
        },
      },
    },
  ],
});
