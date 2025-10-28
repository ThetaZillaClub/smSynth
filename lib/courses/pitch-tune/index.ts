// lib/courses/pitch-tune/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";

const BASE: Partial<SessionConfig> = {
  bpm: 120,
  view: "polar",
  metronome: true,
  callResponse: true,
  exerciseLoops: 4,
  regenerateBetweenTakes: true,

  timingFreeResponse: true,
  timingFreeMaxSec: 10,
  timingFreeMinCaptureSec: 1,

  // Major scale context; gameplay resolves tonic as usual.
  scale: { name: "major", tonicPc: 0, maxPerDegree: 8 },

  rhythm: {
    mode: "random",
    available: ["whole"],
    lengthBars: 1,
    restProb: 0,
    allowRests: false,
    contentRestProb: 0,
    contentAllowRests: false,
    lineEnabled: false,
    detectEnabled: false,
  },
};

export default defineCourse({
  slug: "pitch-tune",
  title: "Pitch Tune",
  subtitle: "Single tone call & response",
  base: BASE,
  lessons: [
    {
      slug: "do",
      title: "Do",
      summary: "Home tone, stable and calm.",
      overrides: { allowedDegrees: [0] },
    },
    {
      slug: "re",
      title: "Re",
      summary: "Forward leaning and bright.",
      overrides: { allowedDegrees: [1] },
    },
    {
      slug: "mi",
      title: "Mi",
      summary: "Warm major color, relaxed.",
      overrides: { allowedDegrees: [2] },
    },
    {
      slug: "fa",
      title: "Fa",
      summary: "Steady tone that sets up motion.",
      overrides: { allowedDegrees: [3] },
    },
    {
      slug: "sol",
      title: "Sol",
      summary: "Open and resonant, strong center.",
      overrides: { allowedDegrees: [4] },
    },
    {
      slug: "la",
      title: "La",
      summary: "Lyrical and light, invites motion.",
      overrides: { allowedDegrees: [5] },
    },
    {
      slug: "ti",
      title: "Ti",
      summary: "Tense and bright, wants to resolve to do.",
      overrides: { allowedDegrees: [6] },
    },
  ],
});
