// lib/courses/scales/index.ts
import type { CourseDef } from "../types";

export const SCALES_COURSE: CourseDef = {
  slug: "scales",
  title: "Scales",
  subtitle: "Within-key scale work",
  lessons: [
    {
      slug: "major-one-octave-middle-2-bars",
      title: "Major — 1 octave (middle), 2 bars",
      summary: "Straight quarter notes, no rests.",
      config: {
        scale: { name: "major", tonicPc: 0 },
        preferredOctaveIndices: [1],
        rhythm: {
          mode: "sequence",
          pattern: "asc-desc",
          available: ["quarter"],
          lengthBars: 2,
        } as any,
        callResponse: false,
        loopingMode: true,
      },
    },
    {
      slug: "major-random-key-oct2-2-bars",
      title: "Major — random key (Octave 2), 2 bars",
      summary: "Random key per launch; centered in Octave 2 if available.",
      config: {
        scale: { name: "major", tonicPc: 0, randomTonic: true },
        preferredOctaveIndices: [1],
        rhythm: {
          mode: "random",
          available: ["quarter"],
          lengthBars: 2,
          contentAllowRests: false,
        } as any,
        callResponse: false,
      },
    },
    {
      slug: "natural-minor-one-octave-middle-2-bars",
      title: "Natural minor — 1 octave (middle), 2 bars",
      summary: "Natural minor in the comfortable window.",
      config: {
        scale: { name: "natural_minor", tonicPc: 9, randomTonic: true },
        preferredOctaveIndices: [1],
        rhythm: {
          mode: "sequence",
          pattern: "asc-desc",
          available: ["quarter"],
          lengthBars: 2,
        } as any,
      },
    },
    {
      slug: "major-135-degree-focus-2-bars",
      title: "Major — 1-3-5 focus, 2 bars",
      summary: "Targets tonic/third/fifth only.",
      config: {
        scale: { name: "major", tonicPc: 7 },
        allowedDegrees: [0, 2, 4],
        preferredOctaveIndices: [1],
        rhythm: { mode: "random", available: ["quarter"], lengthBars: 2 } as any,
      },
    },
    {
      slug: "major-eighths-syncopated-2-bars",
      title: "Major — syncopated eighths, 2 bars",
      summary: "Eighth-note syncopation; rhythm line enabled.",
      config: {
        scale: { name: "major", tonicPc: 0, randomTonic: true },
        preferredOctaveIndices: [1],
        rhythm: {
          mode: "random",
          available: ["eighth", "quarter"],
          lengthBars: 2,
          lineEnabled: true,
          detectEnabled: true,
          contentAllowRests: true,
          contentRestProb: 0.15,
        } as any,
      },
    },
    {
      slug: "intervals-m3-M3-P5",
      title: "Intervals — m3/M3/P5 targets",
      summary: "Interval drill inside a key.",
      config: {
        scale: { name: "major", tonicPc: 0 },
        rhythm: {
          mode: "interval",
          intervals: [3, 4, 7, 12],
          numIntervals: 8,
          available: ["quarter"],
        } as any,
        callResponse: false,
      },
    },
  ],
};

export default SCALES_COURSE;
