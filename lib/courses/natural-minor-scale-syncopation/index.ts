// lib/courses/natural-minor-scale-syncopation/index.ts
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
  scale: { name: "natural_minor", tonicPc: 0 },
  dropUpperWindowDegrees: true,
};

export default defineCourse({
  slug: "natural-minor-scale-syncopation-exercises",
  title: "Natural Minor Syncopation",
  subtitle: "Syncopation practice in natural minor with visual feedback and detection.",
  base: BASE,
  lessons: [
    { slug: "quarters-only", title: "Quarters", summary: "Quarter-note prompts across the scale.", overrides: { rhythm: { available: ["quarter"] as NoteValue[] } } },
    { slug: "quarter-eighth", title: "Quarters + Eighths", summary: "Subdivision control under syncopation.", overrides: { rhythm: { available: ["quarter", "eighth"] as NoteValue[] } } },
    { slug: "triplet-quarter-and-quarter", title: "Triplet Quarters + Quarters", summary: "Stay aligned when switching grids.", overrides: { rhythm: { available: ["triplet-quarter", "quarter"] as NoteValue[] } } },
    { slug: "mixed-values", title: "Mixed Values", summary: "Quarter, eighth, and triplet-quarter values combined.", overrides: { rhythm: { available: ["quarter", "eighth", "triplet-quarter"] as NoteValue[] } } },
  ],
});
