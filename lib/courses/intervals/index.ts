// lib/courses/intervals/index.ts
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

  // Chromatic so every semitone is available.
  scale: { name: "chromatic", tonicPc: 0, maxPerDegree: 1 },

  rhythm: {
    mode: "random",
    available: ["half"], // two notes per bar for clear pairs
    lengthBars: 1,
    lineEnabled: false,
    detectEnabled: false,
    allowRests: false,
    restProb: 0,
    contentAllowRests: false,
    contentRestProb: 0,
  },
};

export default defineCourse({
  slug: "intervals",
  title: "Intervals",
  subtitle: "Two tone call & response",
  base: BASE,
  lessons: [
    // MAJOR
    { slug: "major-second",  title: "Major second",  summary: "Bright step that moves forward and feels open.",         overrides: { allowedDegrees: [0, 2] } },
    { slug: "major-third",   title: "Major third",   summary: "Happy sunny sound with a clear lift.",                   overrides: { allowedDegrees: [0, 4] } },
    { slug: "major-sixth",   title: "Major sixth",   summary: "Wide warm leap that feels friendly and singable.",       overrides: { allowedDegrees: [0, 9] } },
    { slug: "major-seventh", title: "Major seventh", summary: "Tense reaching sound that wants to rise.",               overrides: { allowedDegrees: [0, 11] } },

    // MINOR
    { slug: "minor-second",  title: "Minor second",  summary: "Tight close squeeze with sharp tension.",                overrides: { allowedDegrees: [0, 1] } },
    { slug: "minor-third",   title: "Minor third",   summary: "Soft sad color with a gentle pull.",                     overrides: { allowedDegrees: [0, 3] } },
    { slug: "minor-sixth",   title: "Minor sixth",   summary: "Long bittersweet reach that feels like a sigh.",         overrides: { allowedDegrees: [0, 8] } },
    { slug: "minor-seventh", title: "Minor seventh", summary: "Laid back bluesy pull with an easy sway.",               overrides: { allowedDegrees: [0, 10] } },

    // PERFECT + TRITONE + OCTAVE
    { slug: "perfect-fourth", title: "Perfect fourth", summary: "Solid steady span that feels grounded.",               overrides: { allowedDegrees: [0, 5] } },
    { slug: "perfect-fifth",  title: "Perfect fifth",  summary: "Clean open ring with strong stability.",               overrides: { allowedDegrees: [0, 7] } },
    { slug: "tritone",        title: "Tritone",        summary: "Edgy uneasy tension that needs to move.",              overrides: { allowedDegrees: [0, 6] } },
    { slug: "octave",         title: "Octave",         summary: "Same note higher, full and settled.",                  overrides: { allowedDegrees: [0], dropUpperWindowDegrees: false } },
  ],
});
