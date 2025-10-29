// lib/courses/melodic-minor-scale-syncopation/index.ts
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

  rhythm: {
    ...RHYTHM_FLAGS,
    mode: "random",
    available: ["quarter"],
  },

  scale: { name: "melodic_minor", tonicPc: 0 },
  dropUpperWindowDegrees: true,
};

export default defineCourse({
  slug: "melodic-minor-scale-syncopation",
  title: "Melodic Minor Scale — Syncopation",
  subtitle:
    "Hone syncopation in melodic minor with randomized, 4-bar drills—tighten timing, articulation, and reading.",
  base: BASE,
  lessons: [
    {
      slug: "quarters-only",
      title: "Quarters Only",
      summary: "Quarter-note prompts across the full melodic minor scale.",
      overrides: { rhythm: { available: ["quarter"] as NoteValue[] } },
    },
    {
      slug: "quarter-eighth",
      title: "Quarter & Eighth Notes",
      summary: "Subdivision stability in melodic minor with quarters and eighths.",
      overrides: { rhythm: { available: ["quarter", "eighth"] as NoteValue[] } },
    },
    {
      slug: "triplet-quarter-and-quarter",
      title: "Triplet Quarters & Quarters",
      summary: "Triplet vs straight quarters—stay locked through rests.",
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
