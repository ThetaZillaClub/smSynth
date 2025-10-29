// lib/courses/major-scale-syncopation/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";
import type { NoteValue } from "@/utils/time/tempo";

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
  rhythm: { ...RHYTHM_FLAGS, mode: "random", available: ["quarter"] },
  scale: { name: "major", tonicPc: 0 },
  dropUpperWindowDegrees: true,
};

export default defineCourse({
  slug: "major-scale-syncopation-exercises",
  title: "Major Syncopation",
  subtitle: "Syncopation drills for the major scale with visual feedback and detection.",
  base: BASE,
  lessons: [
    { slug: "quarters-only", title: "Quarters", summary: "Quarter-note prompts with line and detect enabled.", overrides: { rhythm: { available: ["quarter"] as NoteValue[] } } },
    { slug: "quarter-eighth", title: "Quarters + Eighths", summary: "Stabilize subdivision under syncopation.", overrides: { rhythm: { available: ["quarter", "eighth"] as NoteValue[] } } },
    { slug: "triplet-quarter-and-quarter", title: "Triplet Quarters + Quarters", summary: "Refine switching between grids under rests.", overrides: { rhythm: { available: ["triplet-quarter", "quarter"] as NoteValue[] } } },
    { slug: "dotted-eighth-quarter", title: "Dotted Eighths + Quarters", summary: "Introduce dotted feel against steady quarters.", overrides: { rhythm: { available: ["dotted-eighth", "quarter"] as NoteValue[] } } },
    { slug: "all-note-values", title: "All Note Values", summary: "Comprehensive mix: simple, dotted, and triplet feels.", overrides: { rhythm: { available: ["whole", "half", "quarter", "eighth", "dotted-eighth", "triplet-quarter"] as NoteValue[] } } },
  ],
});
