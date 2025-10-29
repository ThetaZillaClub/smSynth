// lib/courses/builder.ts
import type { CourseDef, LessonDef } from "./types";
import type {
  SessionConfig,
  RhythmConfig,
  ScaleConfig,
  ViewMode,
} from "@/components/training/session/types";
import type { NoteValue } from "@/utils/time/tempo";
import type { ScaleName } from "@/utils/phrase/scales";

/* ============================================================================
   1) PUBLIC: Enumerations & Param Schema — feed this to LLMs or UIs
   ==========================================================================*/

// Canonical value lists (kept here so one file remains the “promptable spec”)
export const SCALE_NAMES = [
  "major",
  "natural_minor",
  "harmonic_minor",
  "melodic_minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
  "major_pentatonic",
  "minor_pentatonic",
  "chromatic",
] as const satisfies Readonly<ScaleName[]>;

export const NOTE_VALUES = [
  "whole",
  "dotted-half",
  "half",
  "dotted-quarter",
  "triplet-quarter",
  "quarter",
  "dotted-eighth",
  "triplet-eighth",
  "eighth",
  "dotted-sixteenth",
  "triplet-sixteenth",
  "sixteenth",
  "thirtysecond",
] as const satisfies Readonly<NoteValue[]>;

export const RHYTHM_MODES = ["sequence", "random", "interval"] as const;
export const SEQUENCE_PATTERNS = ["asc", "desc", "asc-desc", "desc-asc"] as const;
export const VIEW_MODES = ["piano", "sheet", "polar"] as const satisfies Readonly<ViewMode[]>;
export const CR_KINDS = [
  "single_tonic",
  "derived_tonic",
  "guided_arpeggio",
  "internal_arpeggio",
] as const;

/**
 * Machine-readable, LLM-friendly parameter catalog.
 * The idea: you can stringify this, show it in a help panel, or include it in a prompt.
 */
export const COURSE_PARAM_SCHEMA = {
  course: {
    slug: { type: "string", desc: "URL-safe identifier, e.g. 'scales'." },
    title: { type: "string", desc: "Human title, e.g. 'Scales'." },
    subtitle: { type: "string", optional: true },
  },
  lesson: {
    slug: { type: "string", desc: "URL-safe identifier within the course." },
    title: { type: "string" },
    summary: { type: "string", optional: true },
  },
  session: {
    // ---- Core timing/UI ----
    bpm: { type: "number", desc: "Beats per minute. Effective BPM is user-speed adjusted." },
    ts: { type: "{ num:number; den:number }", desc: "Time signature (e.g., {num:4, den:4})." },
    leadBars: { type: "number", desc: "Lead-in bars before record.", examples: [1, 2] },
    restBars: { type: "number", desc: "Rest bars after record.", examples: [1] },
    exerciseBars: { type: "number", desc: "Fallback phrase bar count when rhythm omitted." },

    noteValue: { type: "NoteValue", optional: true, oneOf: NOTE_VALUES },
    noteDurSec: { type: "number", optional: true, desc: "Fixed seconds per note (overrides noteValue)." },

    view: { type: "ViewMode", oneOf: VIEW_MODES, desc: "Main content view." },
    metronome: { type: "boolean" },

    callResponse: { type: "boolean", desc: "Legacy toggle; sequence is preferred." },
    callResponseSequence: {
      type: "CRMode[]",
      oneOf: CR_KINDS,
      desc: "Pretest sequence before exercise (e.g., single_tonic).",
    },

    exerciseLoops: { type: "number", desc: "Takes per exercise (rounds)." },
    regenerateBetweenTakes: { type: "boolean", desc: "Re-randomize between takes when looping." },
    loopingMode: { type: "boolean", desc: "Auto-continue after REST." },
    advancedMode: { type: "boolean", desc: "UI/UX feature flag." },

    // ---- Scale / Key ----
    scale: {
      group: true,
      fields: {
        name: { type: "ScaleName", oneOf: SCALE_NAMES },
        tonicPc: { type: "number", range: "0..11" },
        maxPerDegree: { type: "number", optional: true, desc: "Per-degree cap for selection." },
        seed: { type: "number", optional: true },
        randomTonic: { type: "boolean", optional: true, desc: "Let gameplay resolve key." },
      },
    },

    // ---- Rhythm (discriminated union) ----
    rhythm: {
      group: true,
      unionOn: "mode",
      common: {
        available: { type: "NoteValue[]", optional: true, oneOf: NOTE_VALUES },
        restProb: { type: "number", optional: true, desc: "0..1 probability for rests." },
        allowRests: { type: "boolean", optional: true },
        contentRestProb: { type: "number", optional: true },
        contentAllowRests: { type: "boolean", optional: true },
        lengthBars: { type: "number", optional: true, desc: "Bar count for fabric (random mode)." },
        seed: { type: "number", optional: true },
        lineEnabled: { type: "boolean", optional: true, desc: "Show rhythm line (vision UI)." },
        detectEnabled: { type: "boolean", optional: true, desc: "Enable rhythm detection." },
      },
      byMode: {
        sequence: {
          mode: "sequence",
          pattern: { type: "enum", oneOf: SEQUENCE_PATTERNS, desc: "Traversal of scale degrees." },
        },
        random: {
          mode: "random",
          // no extra fields beyond common; fabric builds to bars/available
        },
        interval: {
          mode: "interval",
          intervals: { type: "number[]", desc: "Semitone distances (e.g. [3,4,7])." },
          numIntervals: { type: "number", desc: "How many interval pairs." },
        },
      },
    },

    // ---- Key anchoring / selection windows ----
    tonicMidis: { type: "number[] | null", optional: true, desc: "Absolute tonic window(s)." },
    includeUpperTonic: { type: "boolean", optional: true },

    randomIncludeUnder: { type: "boolean", optional: true, desc: "Allow notes below selected windows (random mode)." },
    randomIncludeOver: { type: "boolean", optional: true, desc: "Allow notes above selected windows (random mode)." },
    dropUpperWindowDegrees: { type: "boolean", optional: true, desc: "Drop octave-duplicate degrees at window top." },

    // ---- Degree / MIDI filters ----
    allowedDegrees: {
      type: "number[] | null",
      optional: true,
      desc: "Whitelist of degree indices within the scale (0-based).",
    },
    allowedMidis: {
      type: "number[] | null",
      optional: true,
      desc: "Absolute MIDI whitelist (still respected).",
    },
    preferredOctaveIndices: {
      type: "number[] | null",
      optional: true,
      desc: "Preferred tonic window indices when multiple are possible.",
    },

    // ---- Timing-free capture (per-note) ----
    timingFreeResponse: { type: "boolean", optional: true },
    timingFreeMaxSec: { type: "number", optional: true, desc: "Overall cap (kept for compat)." },
    timingFreePerNoteMaxSec: { type: "number", optional: true, desc: "Per-note cap (default 5s)." },
    timingFreeMinCaptureSec: { type: "number", optional: true, desc: "Hold time before advancing." },

    // ---- Misc ----
    customPhrase: { type: "Phrase | null", optional: true },
    customWords: { type: "string[] | null", optional: true },
    gestureLatencyMs: { type: "number", optional: true, desc: "Calibration for hand-gesture → event timing." },
  },
} as const;

/** Optional: small helper that formats the schema as a concise Markdown guide. */
export function courseParamGuideMarkdown(): string {
  // Generic helper—accepts any readonly string literal array
  const bullets = <T extends readonly string[]>(arr: T) =>
    arr.map((s) => `\`${s}\``).join(", ");

  return [
    `# Course Param Guide`,
    `## Rhythm`,
    `- modes: ${bullets(RHYTHM_MODES)}`,
    `- sequence.pattern: ${bullets(SEQUENCE_PATTERNS)}`,
    `- common.available NoteValues: ${bullets(NOTE_VALUES)}`,
    `## Scale`,
    `- name: ${bullets(SCALE_NAMES)}`,
    `## View`,
    `- ${bullets(VIEW_MODES)}`,
    `## Call/Response kinds`,
    `- ${bullets(CR_KINDS)}`,
  ].join("\n");
}

/* ============================================================================
   2) PUBLIC: Friendly inputs for lessons/courses (unchanged API shape)
   ==========================================================================*/

/** SessionPatch allows partial nested scale/rhythm to keep authoring tidy. */
type SessionPatch =
  Omit<Partial<SessionConfig>, "scale" | "rhythm"> & {
    scale?: Partial<ScaleConfig>;
    rhythm?: Partial<RhythmConfig>;
  };

export type LessonInput = {
  slug: string;
  title: string;
  summary?: string;
  overrides?: SessionPatch;
};

type LessonInputOrLegacy =
  | LessonInput
  | (Omit<LessonInput, "overrides"> & { config: SessionPatch });

export type CourseInput = {
  slug: string;
  title: string;
  subtitle?: string;
  base?: SessionPatch;
  lessons: LessonInputOrLegacy[];
};

/* ============================================================================
   3) INTERNAL: Merge (backwards compatible)
   ==========================================================================*/

function mergeSession(
  base?: SessionPatch,
  patch?: SessionPatch
): Partial<SessionConfig> {
  const a = base ?? {};
  const b = patch ?? {};

  // Exclude nested objects that have different typings in SessionPatch vs SessionConfig
  const { scale: aScale, rhythm: aRhythm, ...restA } = a;
  const { scale: bScale, rhythm: bRhythm, ...restB } = b;

  // Shallow-merge primitives/arrays first
  const out: Partial<SessionConfig> = { ...restA, ...restB };

  // ---------- SCALE: deep-merge + coerce to valid shape ----------
  if (aScale || bScale) {
    const sa: Partial<ScaleConfig> = aScale ?? {};
    const sb: Partial<ScaleConfig> = bScale ?? {};
    const merged = { ...sa, ...sb } as Partial<ScaleConfig>;

    const name = (merged.name ?? "major") as ScaleConfig["name"];
    const tonicPc = typeof merged.tonicPc === "number" ? merged.tonicPc : 0;

    out.scale = {
      ...merged,
      name,
      tonicPc,
    } as ScaleConfig;
  }

  // ---------- RHYTHM: deep-merge only when a valid discriminant is present ----------
  type RhythmWithMode = { mode: RhythmConfig["mode"] };
  const hasMode = (x: unknown): x is RhythmWithMode =>
    typeof x === "object" && x !== null && typeof (x as { mode?: unknown }).mode === "string";

  if (aRhythm || bRhythm) {
    const ra: Partial<RhythmConfig> = aRhythm ?? {};
    const rb: Partial<RhythmConfig> = bRhythm ?? {};
    const merged = { ...ra, ...rb } as Partial<RhythmConfig>;

    if (hasMode(merged)) {
      out.rhythm = merged as RhythmConfig;
    } else {
      delete (out as { rhythm?: unknown }).rhythm; // keep it absent if not a valid union member
    }
  }

  return out;
}

/* ============================================================================
   4) PUBLIC: defineCourse (unchanged API)
   ==========================================================================*/

export function defineCourse(input: CourseInput): CourseDef {
  // dev-only duplicate-slug guard (per course)
  if (process.env.NODE_ENV !== "production") {
    const seen = new Set<string>();
    for (const l of input.lessons) {
      const slug = l.slug.trim();
      if (seen.has(slug)) {
        throw new Error(`[courses/${input.slug}] duplicate lesson slug "${slug}"`);
      }
      seen.add(slug);
    }
  }

  const lessons: LessonDef[] = input.lessons.map((l) => {
    let perLesson: SessionPatch | undefined;
    if ("config" in l) {
      perLesson = l.config;
    } else if ("overrides" in l) {
      perLesson = l.overrides;
    }

    const config = mergeSession(input.base, perLesson);
    return { slug: l.slug, title: l.title, summary: l.summary, config };
  });

  return {
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    lessons,
  };
}
