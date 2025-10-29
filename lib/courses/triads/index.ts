// lib/courses/triads/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";

const BASE: Partial<SessionConfig> = {
  metronome: true,
  exerciseLoops: 4,
  regenerateBetweenTakes: true,

  callResponse: true,
  // Pretest includes a single tonic and a guided arpeggio
  callResponseSequence: [{ kind: "single_tonic" }, { kind: "guided_arpeggio" }],

  rhythm: {
    mode: "sequence",
    pattern: "asc-desc",
    available: ["quarter"],
    allowRests: false,     // no rests in either line or content
    lineEnabled: false,
    detectEnabled: false,
  },
};

export default defineCourse({
  slug: "triads",
  title: "Triad Shapes",
  subtitle: "Major & minor: arpeggios and mixed practice",
  base: BASE,
  lessons: [
    // --- Sequence (arpeggio) lessons ---
    {
      slug: "major-triad",
      title: "Major Triad — Arpeggio",
      summary: "Ascend then descend the major triad shape in steady time.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],          // triad tones
        dropUpperWindowDegrees: true,       // avoid upper-window octave
      },
    },
    {
      slug: "minor-triad",
      title: "Minor Triad — Arpeggio",
      summary: "Ascend then descend the minor triad shape in steady time.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        dropUpperWindowDegrees: true,
      },
    },

    // --- Mixed/random triad lessons (4 bars, quarters, no rests) ---
    {
      slug: "major-triad-random-4bars",
      title: "Major Triad — Mixed Practice (4 bars)",
      summary: "Quarter-note prompts using triad tones in varied directions; no rests; max two repeats per tone.",
      overrides: {
        scale: { name: "major", tonicPc: 0, maxPerDegree: 1 }, // run cap
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
    {
      slug: "minor-triad-random-4bars",
      title: "Minor Triad — Mixed Practice (4 bars)",
      summary: "Quarter-note prompts using triad tones in varied directions; no rests; max two repeats per tone.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0, maxPerDegree: 1 }, // run cap
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
