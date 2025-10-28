// lib/courses/registry.ts
import type { CourseDef } from "./types";

// Import course modules
import SCALES_COURSE from "./scales";
import PITCH_TUNE_COURSE from "./pitch-tune";
import PITCH_TIME_COURSE from "./pitch-time";
import SCALES_INTRO_COURSE from "./scales-intro";
import TRIADS_COURSE from "./triads";              // ← NEW
import INTERVALS_COURSE from "./intervals";
import INTERVAL_DETECTION_COURSE from "./interval-detection";
import KEY_DETECTION_COURSE from "./key-detection";
import SCALES_RHYTHMS_COURSE from "./scales-rhythms";

// 1) Your intended order lives here (single source of truth)
export const INTENDED_ORDER = [
  "pitch-tune",
  "intervals",
  "pitch-time",
  "scales-intro",
  "triads",                 // ← NEW position
  "interval-detection",
  "scales",
  "key-detection",
  "scales-rhythms",
] as const;

// 2) Map slug → module
const COURSE_MODULES: Record<string, CourseDef> = {
  "scales": SCALES_COURSE,
  "pitch-tune": PITCH_TUNE_COURSE,
  "pitch-time": PITCH_TIME_COURSE,
  "scales-intro": SCALES_INTRO_COURSE,
  "triads": TRIADS_COURSE,                     // ← NEW
  "intervals": INTERVALS_COURSE,
  "interval-detection": INTERVAL_DETECTION_COURSE,
  "key-detection": KEY_DETECTION_COURSE,
  "scales-rhythms": SCALES_RHYTHMS_COURSE,
};

// 3) Registry array in intended order (filters out any missing modules)
export const COURSES: CourseDef[] = INTENDED_ORDER
  .map((slug) => COURSE_MODULES[slug])
  .filter(Boolean);

// 4) Index + helpers
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

// Re-export types so existing imports keep working
export type { CourseDef as _CourseDef, LessonDef } from "./types";
