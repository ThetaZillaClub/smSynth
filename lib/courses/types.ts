// lib/courses/types.ts
import type { SessionConfig } from "@/components/training/session";

export type LessonDef = {
  slug: string;                 // SEO slug (stable)
  title: string;                // Card/display name
  summary?: string;             // Short description
  config: Partial<SessionConfig>;
};

export type CourseDef = {
  slug: string;                 // e.g. "scales"
  title: string;                // e.g. "Scales"
  subtitle?: string;
  lessons: LessonDef[];
};
