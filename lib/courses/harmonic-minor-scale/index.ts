// lib/courses/harmonic-minor-scale/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";
import type { NoteValue } from "@/utils/time/tempo";

const RHYTHM_FLAGS = {
  lengthBars: 4,
  lineEnabled: false,
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
  callResponse: true,
  callResponseSequence: [{ kind: "single_tonic" }, { kind: "guided_arpeggio" }],
  ts: { num: 4, den: 4 },
  rhythm: { ...RHYTHM_FLAGS, mode: "random", available: ["quarter"] },
  scale: { name: "harmonic_minor", tonicPc: 0 },
  dropUpperWindowDegrees: true,
};

export default defineCourse({
  slug: "harmonic-minor-scale-exercises",
  title: "Harmonic Minor",
  subtitle: "Concise randomized drills for confident reading in harmonic minor.",
  base: BASE,
  lessons: [
    { slug: "quarters-only", title: "Quarters", summary: "Quarter-note prompts across the scale.", overrides: { rhythm: { available: ["quarter"] as NoteValue[] } } },
    { slug: "quarter-eighth", title: "Quarters + Eighths", summary: "Groove and subdivision in harmonic minor.", overrides: { rhythm: { available: ["quarter", "eighth"] as NoteValue[] } } },
    { slug: "triplet-quarter-and-quarter", title: "Triplet Quarters + Quarters", summary: "Switch cleanly between triplet and straight feels.", overrides: { rhythm: { available: ["triplet-quarter", "quarter"] as NoteValue[] } } },
    { slug: "mixed-values", title: "Mixed Values", summary: "Quarter, eighth, and triplet-quarter values combined.", overrides: { rhythm: { available: ["quarter", "eighth", "triplet-quarter"] as NoteValue[] } } },
  ],
});
