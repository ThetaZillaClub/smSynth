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
    { kind: "guided_arpeggio" },
  ],

  // 4/4, 4-bar random fabrics with rests enabled
  ts: { num: 4, den: 4 },
  rhythm: {
    mode: "random",
    lengthBars: 4,
    lineEnabled: false,
    detectEnabled: false,
    allowRests: true,
    restProb: 0.2,
    contentAllowRests: true,
    contentRestProb: 0.2,
  },

  // Limit internally to simple range; not referenced in UI copy
  scale: { name: "major", tonicPc: 0 },
  allowedDegrees: [0, 1, 2, 3, 4],
  dropUpperWindowDegrees: true,
};

export default defineCourse({
  slug: "introduction-to-rhythm",
  title: "Rhythm Basics",
  subtitle: "Build steady time with short randomized drills across simple and triplet feels.",
  base: BASE,
  lessons: [
    { slug: "whole-half",           title: "Whole + Half",                         summary: "Sustain and shape time.",                      overrides: { rhythm: { available: ["whole", "half"] } } },
    { slug: "half-quarter",         title: "Half + Quarter",                       summary: "Balance motion and space.",                    overrides: { rhythm: { available: ["half", "quarter"] } } },
    { slug: "quarters-and-eighths", title: "Quarters + Eighths",                   summary: "Lock subdivision and groove.",                 overrides: { rhythm: { available: ["quarter", "eighth"] } } },
    { slug: "triplet-vs-quarters",  title: "Triplet Quarters + Quarters",          summary: "Switch cleanly between grids.",                overrides: { rhythm: { available: ["triplet-quarter", "quarter"] } } },

    // NEW dotted lessons (harder than triplets, easier than the full mix)
    { slug: "dotted-eighth-quarter",  title: "Dotted Eighths + Quarters",   summary: "Add dotted quarters to build a strong long–short feel.", overrides: { rhythm: { available: ["dotted-eighth", "quarter"] } } },

    // SEO-friendly final mixed set, now includes dotted values too
    { slug: "all-note-values",      title: "All Note Values",                      summary: "Comprehensive mix: simple, dotted, and triplet feels.", overrides: { rhythm: { available: ["whole", "half", "quarter", "eighth", "dotted-eighth", "triplet-quarter"] } } },
  ],
});
