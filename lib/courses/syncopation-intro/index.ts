// lib/courses/syncopation-intro/index.ts
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
  bpm: 60,
  callResponse: true,
  callResponseSequence: [
    { kind: "single_tonic" },
    { kind: "guided_arpeggio" },
  ],

  ts: { num: 4, den: 4 },

  rhythm: {
    ...RHYTHM_FLAGS,
    mode: "random",
    available: ["quarter"], // default; lessons override
  },

  // default to major; lessons override for minor set
  scale: { name: "major", tonicPc: 0 },
  dropUpperWindowDegrees: true,
};

export default defineCourse({
  slug: "introduction-to-syncopation",
  title: "Syncopation Basics",
  subtitle: "Feel the off-beat with triad-focused drills and clear visual feedback.",
  base: BASE,
  lessons: [
    // Major triad
    {
      slug: "major-triad-quarters-only",
      title: "Major Triad Quarters",
      summary: "Quarter-note prompts with line and detection enabled.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter"] as NoteValue[] },
      },
    },
    {
      slug: "major-triad-quarter-eighth",
      title: "Major Triad Quarters + Eighths",
      summary: "Quarters and eighths across the triad with rests.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter", "eighth"] as NoteValue[] },
      },
    },
    {
      slug: "major-triad-triplet-and-quarter",
      title: "Major Triad Triplet Quarters + Quarters",
      summary: "Practice switching between triplet and straight feels.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["triplet-quarter", "quarter"] as NoteValue[] },
      },
    },
    {
      slug: "major-triad-all-of-the-above",
      title: "Major Triad Mixed Values",
      summary: "Quarter, eighth, and triplet-quarter values combined.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter", "eighth", "triplet-quarter"] as NoteValue[] },
      },
    },

    // Minor triad
    {
      slug: "minor-triad-quarters-only",
      title: "Minor Triad Quarters",
      summary: "Quarter-note prompts with line and detection enabled.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter"] as NoteValue[] },
      },
    },
    {
      slug: "minor-triad-quarter-eighth",
      title: "Minor Triad Quarters + Eighths",
      summary: "Quarters and eighths across the triad with rests.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter", "eighth"] as NoteValue[] },
      },
    },
    {
      slug: "minor-triad-triplet-and-quarter",
      title: "Minor Triad Triplet Quarters + Quarters",
      summary: "Switch cleanly between triplet and straight feels.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["triplet-quarter", "quarter"] as NoteValue[] },
      },
    },
    {
      slug: "minor-triad-all-of-the-above",
      title: "Minor Triad Mixed Values",
      summary: "Quarter, eighth, and triplet-quarter values combined.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter", "eighth", "triplet-quarter"] as NoteValue[] },
      },
    },
  ],
});
