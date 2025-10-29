// lib/courses/major-scale/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";
import type { NoteValue } from "@/utils/time/tempo";

// Shared rhythm flags for all lessons
const RHYTHM_FLAGS = {
  lengthBars: 4,
  lineEnabled: false, // gesture syncopation UI reserved for later
  detectEnabled: false,
  allowRests: true,
  restProb: 0.2,
  contentAllowRests: true,
  contentRestProb: 0.2,
} as const;

const BASE: Partial<SessionConfig> = {
  metronome: true,
  exerciseLoops: 4,
  regenerateBetweenTakes: true,

  // Keep the helpful CR warm-up the same as rhythm-intro
  callResponse: true,
  callResponseSequence: [
    { kind: "single_tonic" },
    { kind: "guided_arpeggio" },
  ],

  ts: { num: 4, den: 4 },

  // Default: random quarters (first lesson). Lessons override 'available'.
  rhythm: {
    ...RHYTHM_FLAGS,
    mode: "random",
    available: ["quarter"],
  },

  // Major scale — no degree limitation
  scale: { name: "major", tonicPc: 0 },
  dropUpperWindowDegrees: true,
  // intentionally no allowedDegrees → full scale access
};

export default defineCourse({
  slug: "major-scale",
  title: "Major Scale",
  subtitle:
    "Build timing and full-range fluency with randomized major-scale exercises—develop confident reading and navigation across the entire scale.",
  base: BASE,
  lessons: [
    {
      slug: "quarters-only",
      title: "Quarters Only",
      summary: "Quarter-note prompts over the full major scale; natural rests included.",
      overrides: {
        rhythm: { available: ["quarter"] as NoteValue[] },
      },
    },
    {
      slug: "quarter-eighth",
      title: "Quarter & Eighth Notes",
      summary: "Mix of quarters and eighths to strengthen groove and subdivision.",
      overrides: {
        rhythm: { available: ["quarter", "eighth"] as NoteValue[] },
      },
    },
    {
      slug: "triplet-quarter-and-quarter",
      title: "Triplet Quarters & Quarters",
      summary: "Introduce the triplet grid against straight quarters for feel control.",
      overrides: {
        rhythm: { available: ["triplet-quarter", "quarter"] as NoteValue[] },
      },
    },
    {
      slug: "all-of-the-above",
      title: "All of the Above",
      summary: "A mixed set to test adaptability: quarter, eighth, and triplet-quarter values.",
      overrides: {
        rhythm: {
          available: ["quarter", "eighth", "triplet-quarter"] as NoteValue[],
        },
      },
    },
  ],
});
