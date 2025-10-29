// lib/courses/syncopation-intro/index.ts
import { defineCourse } from "../builder";
import type { SessionConfig } from "@/components/training/session/types";
import type { NoteValue } from "@/utils/time/tempo";

// Syncopation visuals + detection on, higher rest probability
const RHYTHM_FLAGS = {
  lengthBars: 4,
  lineEnabled: true,   // show rhythm line for syncopation
  detectEnabled: true, // enable rhythm detection
  allowRests: true,
  restProb: 0.35,
  contentAllowRests: true,
  contentRestProb: 0.35,
} as const;

const BASE: Partial<SessionConfig> = {
  metronome: true,
  exerciseLoops: 4,
  regenerateBetweenTakes: true,

  callResponse: true,
  callResponseSequence: [
    { kind: "single_tonic" },
    { kind: "guided_arpeggio" },
  ],

  ts: { num: 4, den: 4 },

  rhythm: {
    ...RHYTHM_FLAGS,
    mode: "random",
    available: ["quarter"], // default; lessons override
  },

  // default to major; lessons override scale for minor set
  scale: { name: "major", tonicPc: 0 },
  dropUpperWindowDegrees: true,
};

export default defineCourse({
  slug: "syncopation-intro",
  title: "Introduction to Syncopation",
  subtitle:
    "Strengthen your feel for off-beats and space with randomized, triad-focused prompts—build accuracy reading and performing syncopated rhythms.",
  base: BASE,
  lessons: [
    // ---- Major triad (allowed degrees: 1–3–5) ----
    {
      slug: "major-triad-quarters-only",
      title: "Major Triad — Quarters Only",
      summary: "Random quarter-note prompts on 1–3–5; line & detect on; ~35% rests.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter"] as NoteValue[] },
      },
    },
    {
      slug: "major-triad-quarter-eighth",
      title: "Major Triad — Quarter & Eighth Notes",
      summary: "Quarters + eighths across the major triad; syncopation visuals enabled.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter", "eighth"] as NoteValue[] },
      },
    },
    {
      slug: "major-triad-triplet-and-quarter",
      title: "Major Triad — Triplet Quarters & Quarters",
      summary: "Triplet quarters against straight quarters for feel control on 1–3–5.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["triplet-quarter", "quarter"] as NoteValue[] },
      },
    },
    {
      slug: "major-triad-all-of-the-above",
      title: "Major Triad — All of the Above",
      summary: "Mixed practice over the triad: quarter, eighth, triplet-quarter values.",
      overrides: {
        scale: { name: "major", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter", "eighth", "triplet-quarter"] as NoteValue[] },
      },
    },

    // ---- Minor triad (allowed degrees: 1–♭3–5 in natural minor) ----
    {
      slug: "minor-triad-quarters-only",
      title: "Minor Triad — Quarters Only",
      summary: "Random quarter-note prompts on 1–♭3–5; line & detect on; ~35% rests.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter"] as NoteValue[] },
      },
    },
    {
      slug: "minor-triad-quarter-eighth",
      title: "Minor Triad — Quarter & Eighth Notes",
      summary: "Quarters + eighths across the minor triad; syncopation visuals enabled.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter", "eighth"] as NoteValue[] },
      },
    },
    {
      slug: "minor-triad-triplet-and-quarter",
      title: "Minor Triad — Triplet Quarters & Quarters",
      summary: "Triplet quarters against straight quarters for feel control on 1–♭3–5.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["triplet-quarter", "quarter"] as NoteValue[] },
      },
    },
    {
      slug: "minor-triad-all-of-the-above",
      title: "Minor Triad — All of the Above",
      summary: "Mixed practice over the triad: quarter, eighth, triplet-quarter values.",
      overrides: {
        scale: { name: "natural_minor", tonicPc: 0 },
        allowedDegrees: [0, 2, 4],
        rhythm: { available: ["quarter", "eighth", "triplet-quarter"] as NoteValue[] },
      },
    },
  ],
});
