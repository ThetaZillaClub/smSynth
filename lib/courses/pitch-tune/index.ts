// lib/courses/pitch-tune/index.ts
import type { CourseDef } from "../types";
import type { SessionConfig } from "@/components/training/session/types";

const BASE: Partial<SessionConfig> = {
  bpm: 100,                // ← bump from 80 to 100 for this course
  view: "polar",
  metronome: true,
  callResponse: true,
  exerciseLoops: 4,
  regenerateBetweenTakes: true,

  timingFreeResponse: true,
  timingFreeMaxSec: 10,
  timingFreeMinCaptureSec: 1,

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

const deg = (degree: number, title: string, slug: string, summary: string) => ({
  slug,
  title,
  summary,
  config: {
    ...BASE,
    // restrict to a single diatonic scale degree (0=Do, 1=Re, ... 6=Ti)
    allowedDegrees: [degree],
  } as Partial<SessionConfig>,
});

const PITCH_TUNE_COURSE: CourseDef = {
  slug: "pitch-tune",
  title: "Pitch Tune",
  subtitle: "Single-pitch call & response",
  lessons: [
    deg(0, "Match Do (1)",  "do-1",  "Listen, then sing Do. Aim for the green capture band."),
    deg(1, "Match Re (2)",  "re-2",  "Sing Re relative to the current key."),
    deg(2, "Match Mi (3)",  "mi-3",  "Hold Mi steadily in tune."),
    deg(3, "Match Fa (4)",  "fa-4",  "Lock into Fa; watch the cents arrow."),
    deg(4, "Match Sol (5)", "sol-5", "Sing Sol with a centered tone."),
    deg(5, "Match La (6)",  "la-6",  "Match La cleanly and consistently."),
    deg(6, "Match Ti (7)",  "ti-7",  "Find Ti; feel the leading-tone pull."),
  ],
};

export default PITCH_TUNE_COURSE;
