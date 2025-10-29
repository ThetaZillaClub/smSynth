// lib/courses/triads/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";

const BASE: Partial<SessionConfig> = {
  metronome: true,
  view: "sheet",
  exerciseLoops: 4,
  regenerateBetweenTakes: true,

  callResponse: true,
  callResponseSequence: [{ kind: "single_tonic" }, { kind: "guided_arpeggio" }],

  // this BASE rhythm is for the sequence/arpeggio lessons
  rhythm: {
    mode: "sequence",
    pattern: "asc-desc",
    available: ["quarter"],
    allowRests: false,
    lineEnabled: false,
    detectEnabled: false,
  },
};

export default defineCourse({
  slug: "triads",
  title: "Basic Triads",
  subtitle: "1-3-5 arpeggios up and down",
  base: BASE,
  lessons: [
    // --- Sequence (arpeggio) lessons ---
    {
      slug: "major-triad",
      title: "Major Triad",
      summary: "Bright 1-3-5 up then down.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        dropUpperWindowDegrees: true,
      },
    },
    {
      slug: "minor-triad",
      title: "Minor Triad",
      summary: "Darker 1-3-5 up then down.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        dropUpperWindowDegrees: true,
      },
    },

    // --- Random-mode triad lessons (4 bars, quarters, no rests) ---
    {
      slug: "major-triad-random-4bars",
      title: "Major Triad — Random (4 bars)",
      summary: "4 bars of random 1-3-5 tones in time (quarters), no rests. Max 2 in a row.",
      overrides: {
        scale: { name: "major", tonicPc: 0, maxPerDegree: 1 },
        allowedDegrees: [0, 2, 4],
        dropUpperWindowDegrees: true,
        rhythm: {
          mode: "random",
          available: ["quarter"],
          lengthBars: 4,
          allowRests: false,          // explicit (does not inherit BASE)
          contentAllowRests: false,   // belt-and-suspenders
        },
      },
    },
    {
      slug: "minor-triad-random-4bars",
      title: "Minor Triad — Random (4 bars)",
      summary: "4 bars of random 1-3-5 tones in time (quarters), no rests. Max 2 in a row.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0, maxPerDegree: 1 },
        allowedDegrees: [0, 2, 4],
        dropUpperWindowDegrees: true,
        rhythm: {
          mode: "random",
          available: ["quarter"],
          lengthBars: 4,
          allowRests: false,
          contentAllowRests: false,
        },
      },
    },
  ],
});
