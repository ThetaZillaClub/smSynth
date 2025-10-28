// lib/courses/pitch-time/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";
import type { NoteValue } from "@/utils/time/tempo";

// Shared (non-rhythm) config
const BASE: Partial<SessionConfig> = {
  metronome: true,
  exerciseLoops: 4,
  regenerateBetweenTakes: true,
  callResponseSequence: [{ kind: "single_tonic" }],
  scale: { name: "chromatic", tonicPc: 0 }, // client can change tonicPc
};

// Strict interval rhythm base (numIntervals always present)
const INTERVAL_BASE = {
  mode: "interval" as const,
  intervals: [] as number[], // overridden per lesson
  numIntervals: 5,
  available: ["quarter"] as NoteValue[],
  lineEnabled: false,
  detectEnabled: false,
};

export default defineCourse({
  slug: "pitch-time",
  title: "Pitch Time",
  subtitle: "Intervals with simple timing",
  base: BASE,
  lessons: [
    // MAJOR
    { slug: "major-second",  title: "Major second",  summary: "Bright step that feels open.",                 overrides: { allowedDegrees: [0, 2],  rhythm: { ...INTERVAL_BASE, intervals: [2]  } } },
    { slug: "major-third",   title: "Major third",   summary: "Sunny color with a clear lift.",               overrides: { allowedDegrees: [0, 4],  rhythm: { ...INTERVAL_BASE, intervals: [4]  } } },
    { slug: "major-sixth",   title: "Major sixth",   summary: "Wide warm leap that feels friendly.",          overrides: { allowedDegrees: [0, 9],  rhythm: { ...INTERVAL_BASE, intervals: [9]  } } },
    { slug: "major-seventh", title: "Major seventh", summary: "Tense high pull that wants to rise.",          overrides: { allowedDegrees: [0, 11], rhythm: { ...INTERVAL_BASE, intervals: [11] } } },

    // MINOR
    { slug: "minor-second",  title: "Minor second",  summary: "Tight close squeeze with sharp tension.",      overrides: { allowedDegrees: [0, 1],  rhythm: { ...INTERVAL_BASE, intervals: [1]  } } },
    { slug: "minor-third",   title: "Minor third",   summary: "Soft sad color with a gentle pull.",           overrides: { allowedDegrees: [0, 3],  rhythm: { ...INTERVAL_BASE, intervals: [3]  } } },
    { slug: "minor-sixth",   title: "Minor sixth",   summary: "Long bittersweet reach like a sigh.",          overrides: { allowedDegrees: [0, 8],  rhythm: { ...INTERVAL_BASE, intervals: [8]  } } },
    { slug: "minor-seventh", title: "Minor seventh", summary: "Bluesy pull with an easy sway.",               overrides: { allowedDegrees: [0, 10], rhythm: { ...INTERVAL_BASE, intervals: [10] } } },

    // PERFECT + TRITONE + OCTAVE
    { slug: "perfect-fourth", title: "Perfect fourth", summary: "Solid steady span that feels grounded.",     overrides: { allowedDegrees: [0, 5],  rhythm: { ...INTERVAL_BASE, intervals: [5]  } } },
    { slug: "perfect-fifth",  title: "Perfect fifth",  summary: "Clean open ring with strong stability.",     overrides: { allowedDegrees: [0, 7],  rhythm: { ...INTERVAL_BASE, intervals: [7]  } } },
    { slug: "tritone",        title: "Tritone",        summary: "Edgy uneasy tension that wants to move.",    overrides: { allowedDegrees: [0, 6],  rhythm: { ...INTERVAL_BASE, intervals: [6]  } } },
    { slug: "octave",         title: "Octave",         summary: "Same note higher. Full and settled.",        overrides: { allowedDegrees: [0],     rhythm: { ...INTERVAL_BASE, intervals: [12] } } },
  ],
});
