// lib/courses/scales/index.ts
import type { CourseDef } from "../types";
import type { NoteValue } from "@/utils/time/tempo";
import type { SessionConfig } from "@/components/training/session/types";

// Base "no rests" knobs used by both the blue line and melody content.
const NO_RESTS = {
  // Blue line UI extras
  allowRests: false,
  restProb: 0,
  // Melody/content rest knobs
  contentAllowRests: false,
  contentRestProb: 0,
} as const;

/**
 * Rhythm baseline for Scales lessons that should participate in
 * rhythm-line (vision) detection AND melody rhythm, with no rests.
 *
 * NOTE:
 * - `lineEnabled: true` and `detectEnabled: true` ensure:
 *   needVision = exerciseUnlocked && rhythmLineEnabled && rhythmDetectEnabled && visionEnabled
 *   will evaluate to true (assuming visionEnabled comes from your provider).
 */
const RHYTHM_BASE = {
  ...NO_RESTS,
  lineEnabled: true,
  detectEnabled: true,
} as const;

const BASE: Partial<SessionConfig> = {
  bpm: 70,
  exerciseLoops: 3,
  // Keep the global CR sequence
  callResponseSequence: [{ kind: "single_tonic" }, { kind: "guided_arpeggio" }],
  // We intentionally do NOT set rhythm.lengthBars here (derived per lesson)
};

// Helper type to avoid `any` on rhythm objects while staying flexible
type RhythmCfg = NonNullable<SessionConfig["rhythm"]>;

// Optional metadata hook your app can use to auto-enable/require vision provider.
// Using a spread of a broadly-typed object avoids excess-property checks without `any`.
const METADATA_SPREAD: Record<string, unknown> = {
  metadata: { requiresVision: true, feature: "rhythm-line" },
};

export const SCALES_COURSE: CourseDef = {
  slug: "scales",
  title: "Scales",
  subtitle: "Within-key scale work",
  ...METADATA_SPREAD,
  lessons: [
    {
      slug: "major-one-octave-middle-2-bars",
      title: "Major — 1 octave (middle), 2 bars",
      summary: "Straight quarter notes, no rests.",
      config: {
        ...BASE,
        scale: { name: "major", tonicPc: 0 },
        preferredOctaveIndices: [1],
        rhythm: {
          ...RHYTHM_BASE,
          mode: "sequence",
          pattern: "asc-desc",
          available: ["quarter"] as NoteValue[],
          // lengthBars intentionally omitted — derived from scale length
        } as unknown as RhythmCfg,
        loopingMode: true,
      },
    },
    {
      slug: "major-random-key-oct2-2-bars",
      title: "Major — random key (Octave 2), 2 bars",
      summary: "Random key per launch; centered in Octave 2 if available.",
      config: {
        ...BASE,
        scale: { name: "major", tonicPc: 0, randomTonic: true },
        preferredOctaveIndices: [1],
        rhythm: {
          ...RHYTHM_BASE,
          mode: "random",
          available: ["quarter"] as NoteValue[],
          // lengthBars intentionally omitted — derived from scale length
        } as unknown as RhythmCfg,
      },
    },
    {
      slug: "natural-minor-one-octave-middle-2-bars",
      title: "Natural minor — 1 octave (middle), 2 bars",
      summary: "Natural minor in the comfortable window.",
      config: {
        ...BASE,
        scale: { name: "natural_minor", tonicPc: 9, randomTonic: true },
        preferredOctaveIndices: [1],
        rhythm: {
          ...RHYTHM_BASE,
          mode: "sequence",
          pattern: "asc-desc",
          available: ["quarter"] as NoteValue[],
          // lengthBars intentionally omitted — derived from scale length
        } as unknown as RhythmCfg,
      },
    },
    {
      slug: "major-135-degree-focus-2-bars",
      title: "Major — 1-3-5 focus, 2 bars",
      summary: "Targets tonic/third/fifth only.",
      config: {
        ...BASE,
        scale: { name: "major", tonicPc: 7 },
        allowedDegrees: [0, 2, 4],
        preferredOctaveIndices: [1],
        rhythm: {
          ...RHYTHM_BASE,
          mode: "random",
          available: ["quarter"] as NoteValue[],
          // lengthBars intentionally omitted — derived from scale length
        } as unknown as RhythmCfg,
      },
    },
    {
      slug: "major-eighths-syncopated-2-bars",
      title: "Major — syncopated eighths, 2 bars",
      summary: "Eighth-note syncopation; rhythm line enabled.",
      config: {
        ...BASE,
        scale: { name: "major", tonicPc: 0, randomTonic: true },
        preferredOctaveIndices: [1],
        rhythm: {
          ...RHYTHM_BASE,
          mode: "random",
          available: ["eighth", "quarter"] as NoteValue[],
          // lengthBars intentionally omitted — derived from scale length
          // Force no rests despite syncopation
        } as unknown as RhythmCfg,
      },
    },
    {
      slug: "intervals-m3-M3-P5",
      title: "Intervals — m3/M3/P5 targets",
      summary: "Interval drill inside a key.",
      config: {
        ...BASE,
        scale: { name: "major", tonicPc: 0 },
        rhythm: {
          ...RHYTHM_BASE,
          mode: "interval",
          intervals: [3, 4, 7, 12],
          numIntervals: 8,
          available: ["quarter"] as NoteValue[],
          // interval mode ignores bar length
        } as unknown as RhythmCfg,
      },
    },
  ],
};

export default SCALES_COURSE;
