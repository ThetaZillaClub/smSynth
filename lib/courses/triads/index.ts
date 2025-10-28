// lib/courses/triads/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";

const BASE: Partial<SessionConfig> = {
  metronome: true,
  view: "sheet",
  exerciseLoops: 4,
  regenerateBetweenTakes: true,

  callResponse: true,
  callResponseSequence: [{ kind: "single_tonic" }],

  rhythm: {
    mode: "sequence",
    pattern: "asc-desc",
    available: ["quarter"],
    allowRests: false,     // ← rests OFF
    lineEnabled: false,
    detectEnabled: false,
  },
};

export default defineCourse({
  slug: "triads",
  title: "Triads",
  subtitle: "1-3-5 arpeggios up and down",
  base: BASE,
  lessons: [
    {
      slug: "major-triad",
      title: "Major Triad",
      summary: "Bright 1-3-5 up then down.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],          // 1,3,5
        dropUpperWindowDegrees: true,       // avoid upper-window octave
      },
    },
    {
      slug: "minor-triad",
      title: "Minor Triad",
      summary: "Darker 1-3-5 up then down.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],          // 1,3,5
        dropUpperWindowDegrees: true,
      },
    },
  ],
});
