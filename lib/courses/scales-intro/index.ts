// lib/courses/scales-intro/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";

const BASE: Partial<SessionConfig> = {
  bpm: 80,
  exerciseLoops: 3,

  // Run a short pretest before each exercise
  callResponse: true,
  callResponseSequence: [
    { kind: "single_tonic" },
    { kind: "guided_arpeggio" }, // ← added
  ],

  // keep it singing-only (no rhythm line / vision)
  rhythm: {
    mode: "sequence",
    pattern: "asc", // per-lesson overrides change this
    available: ["quarter"],
    allowRests: false,
    contentAllowRests: false,
    lineEnabled: false,
    detectEnabled: false,
  },

  // default key shape (lesson overrides swap the scale name)
  scale: { name: "major", tonicPc: 0 },

  // keep the comfortable window by default
  preferredOctaveIndices: [1],
};

export default defineCourse({
  slug: "scales-intro",
  title: "Introduction to Scales",
  subtitle: "Major and minor, simple sequences",
  base: BASE,
  lessons: [
    // Major
    {
      slug: "major-up",
      title: "Major up",
      summary: "One octave, quarters, no rests",
      overrides: { scale: { name: "major" }, rhythm: { mode: "sequence", pattern: "asc" } },
    },
    {
      slug: "major-down",
      title: "Major down",
      summary: "Step down evenly",
      overrides: { scale: { name: "major" }, rhythm: { mode: "sequence", pattern: "desc" } },
    },
    {
      slug: "major-up-down",
      title: "Major up then down",
      summary: "Up and back, steady time",
      overrides: { scale: { name: "major" }, rhythm: { mode: "sequence", pattern: "asc-desc" } },
    },

    // Natural minor
    {
      slug: "minor-up",
      title: "Natural minor up",
      summary: "One octave, quarters, no rests",
      overrides: { scale: { name: "natural_minor" }, rhythm: { mode: "sequence", pattern: "asc" } },
    },
    {
      slug: "minor-down",
      title: "Natural minor down",
      summary: "Step down evenly",
      overrides: { scale: { name: "natural_minor" }, rhythm: { mode: "sequence", pattern: "desc" } },
    },
    {
      slug: "minor-up-down",
      title: "Natural minor up then down",
      summary: "Up and back, steady time",
      overrides: { scale: { name: "natural_minor" }, rhythm: { mode: "sequence", pattern: "asc-desc" } },
    },
  ],
});
