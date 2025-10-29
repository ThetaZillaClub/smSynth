// lib/courses/registry.ts
import type { CourseDef } from "./types";

// Import course modules
import PITCH_TUNE_COURSE from "./pitch-tune";
import PITCH_TIME_COURSE from "./pitch-time";
import SCALES_INTRO_COURSE from "./scales-intro";
import TRIADS_COURSE from "./triads";
import RHYTHM_INTRO_COURSE from "./rhythm-intro";
import MAJOR_SCALE_COURSE from "./major-scale";
import NATURAL_MINOR_SCALE_COURSE from "./natural-minor-scale";
import HARMONIC_MINOR_SCALE_COURSE from "./harmonic-minor-scale";
import MELODIC_MINOR_SCALE_COURSE from "./melodic-minor-scale";
import INTERVALS_COURSE from "./intervals";
import KEY_DETECTION_COURSE from "./key-detection";
import SCALES_RHYTHMS_COURSE from "./scales-rhythms";

// Single source of truth for ordering
export const INTENDED_ORDER = [
  "pitch-tune",
  "intervals",
  "pitch-time",
  "rhythm-intro",
  "triads",
  "scales-intro",
  "major-scale",
  "natural-minor-scale",
  "harmonic-minor-scale",
  "melodic-minor-scale",
  "key-detection",
  "scales-rhythms",
] as const;

// Map slug → module
const COURSE_MODULES: Record<string, CourseDef> = {
  "pitch-tune": PITCH_TUNE_COURSE,
  "pitch-time": PITCH_TIME_COURSE,
  "scales-intro": SCALES_INTRO_COURSE,
  "major-scale": MAJOR_SCALE_COURSE,
  "natural-minor-scale": NATURAL_MINOR_SCALE_COURSE,
  "harmonic-minor-scale": HARMONIC_MINOR_SCALE_COURSE,
  "melodic-minor-scale": MELODIC_MINOR_SCALE_COURSE,
  "triads": TRIADS_COURSE,
  "rhythm-intro": RHYTHM_INTRO_COURSE,
  "intervals": INTERVALS_COURSE,
  "key-detection": KEY_DETECTION_COURSE,
  "scales-rhythms": SCALES_RHYTHMS_COURSE,
};

// Registry in intended order
export const COURSES: CourseDef[] = INTENDED_ORDER
  .map((slug) => COURSE_MODULES[slug])
  .filter(Boolean);

// Index + helpers unchanged…
export const COURSE_INDEX: Record<string, CourseDef> = Object.fromEntries(
  COURSES.map((c) => [c.slug, c])
);

export function findCourse(slug: string): CourseDef | undefined {
  return COURSE_INDEX[slug];
}

export function findLesson(courseSlug: string, lessonSlug: string) {
  const course = findCourse(courseSlug);
  if (!course) return null;
  const lesson = course.lessons.find((l) => l.slug === lessonSlug);
  return lesson ? { course, lesson } : null;
}

export type { CourseDef as _CourseDef, LessonDef } from "./types";
