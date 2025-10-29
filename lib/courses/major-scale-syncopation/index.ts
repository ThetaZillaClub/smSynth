// lib/courses/major-scale-syncopation/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";
import type { NoteValue } from "@/utils/time/tempo";

// Syncopation visuals + detection on, higher rest probability
const RHYTHM_FLAGS = {
  lengthBars: 4,
  lineEnabled: true,
  detectEnabled: true,
  allowRests: true,
  restProb: 0.35,
  contentAllowRests: true,
  contentRestProb: 0.35,
} as const;

const BASE: Partial<SessionConfig> = {
  metronome: true,
  exerciseLoops: 4,
  regenerateBetweenTakes: true,

  callResponse: true,
  callResponseSequence: [{ kind: "single_tonic" }, { kind: "guided_arpeggio" }],

  ts: { num: 4, den: 4 },

  rhythm: {
    ...RHYTHM_FLAGS,
    mode: "random",
    available: ["quarter"],
  },

  // Major scale — full scale (no degree limitation)
  scale: { name: "major", tonicPc: 0 },
  dropUpperWindowDegrees: true,
};

export default defineCourse({
  slug: "major-scale-syncopation",
  title: "Major Scale — Syncopation",
  subtitle:
    "Master off-beats and space in the major scale with randomized, 4-bar syncopation drills—build precise timing and confident reading.",
  base: BASE,
  lessons: [
    {
      slug: "quarters-only",
      title: "Quarters Only",
      summary: "Quarter-note prompts across the full major scale; line & detect on; frequent rests for feel.",
      overrides: { rhythm: { available: ["quarter"] as NoteValue[] } },
    },
    {
      slug: "quarter-eighth",
      title: "Quarter & Eighth Notes",
      summary: "Alternate quarters and eighths to stabilize subdivision under syncopation.",
      overrides: { rhythm: { available: ["quarter", "eighth"] as NoteValue[] } },
    },
    {
      slug: "triplet-quarter-and-quarter",
      title: "Triplet Quarters & Quarters",
      summary: "Triplet quarters against straight quarters to refine grid switching.",
      overrides: { rhythm: { available: ["triplet-quarter", "quarter"] as NoteValue[] } },
    },
    {
      slug: "all-of-the-above",
      title: "All of the Above",
      summary: "Mixed practice: quarter, eighth, and triplet-quarter values.",
      overrides: { rhythm: { available: ["quarter", "eighth", "triplet-quarter"] as NoteValue[] } },
    },
  ],
});
