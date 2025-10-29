// lib/courses/rhythm-intro/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";

// Base mirrors Triads foundation but adapts for rhythm-first practice
const BASE: Partial<SessionConfig> = {
  metronome: true,
  exerciseLoops: 4,
  regenerateBetweenTakes: true,
  

  callResponse: true,
  callResponseSequence: [
    { kind: "single_tonic" },
    { kind: "guided_arpeggio" }, // ← added
  ],

  // 4/4, 4-bar random fabrics with rests enabled
  ts: { num: 4, den: 4 },
  rhythm: {
    mode: "random",
    lengthBars: 4,

    lineEnabled: false,
    detectEnabled: false,

    // Rests: enabled globally for line & content at p = 0.2
    allowRests: true,
    restProb: 0.2,
    contentAllowRests: true,
    contentRestProb: 0.2,
  },

  // Key/pitch scope: major, degrees 1–5 only
  scale: { name: "major", tonicPc: 0 },
  allowedDegrees: [0, 1, 2, 3, 4], // 1–5 in 0-based indexing
  dropUpperWindowDegrees: true,
};

export default defineCourse({
  slug: "rhythm-intro",
  title: "Introduction to Rhythm",
  subtitle: "Major scale degrees 1–5, randomized rhythms with rests (p=0.2)",
  base: BASE,
  lessons: [
    {
      slug: "whole-half",
      title: "Whole & Half Notes (4 bars)",
      summary: "Random 1–5 pitches using whole and half notes; rests ~20%.",
      overrides: {
        rhythm: { available: ["whole", "half"] },
      },
    },
    {
      slug: "half-quarter",
      title: "Half & Quarter Notes (4 bars)",
      summary: "Mix of half and quarter notes with occasional rests.",
      overrides: {
        rhythm: { available: ["half", "quarter"] },
      },
    },
    {
      slug: "quarter-eighth",
      title: "Quarter & Eighth Notes (4 bars)",
      summary: "Uptempo feel with quarters and eighths; rests enabled.",
      overrides: {
        rhythm: { available: ["quarter", "eighth"] },
      },
    },
    {
      slug: "triplet-quarter-and-quarter",
      title: "Triplet Quarters & Quarters (4 bars)",
      summary: "Introduce triplet grid against straight quarters.",
      overrides: {
        rhythm: { available: ["triplet-quarter", "quarter"] },
      },
    },
    {
      slug: "all-of-the-above",
      title: "All of the Above (4 bars)",
      summary: "Whole, half, quarter, eighth, and triplet-quarter values mixed.",
      overrides: {
        rhythm: { available: ["whole", "half", "quarter", "eighth", "triplet-quarter"] },
      },
    },
  ],
});