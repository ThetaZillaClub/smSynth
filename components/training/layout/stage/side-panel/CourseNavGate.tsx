// components/training/layout/stage/side-panel/CourseNavGate.tsx
"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { COURSES, findCourse } from "@/lib/courses/registry";
import type { CourseDef, LessonDef } from "@/lib/courses/types";
import { CourseNavPanel } from "./CourseNavPanel";

export default function CourseNavGate({
  courseSlugParam,
  lessonSlug,         // may be "lesson" or "course/lesson"
  sessionComplete,
}: {
  courseSlugParam?: string;
  lessonSlug?: string | null;
  sessionComplete: boolean;
}) {
  const router = useRouter();
  if (!sessionComplete) return null;

  // Always normalize: if "course/lesson" is provided, derive both pieces.
  let courseSlug = courseSlugParam ?? undefined;
  let lessonSlugPlain = (lessonSlug ?? undefined) as string | undefined;

  if (lessonSlugPlain?.includes("/")) {
    const [maybeCourse, maybeLesson] = lessonSlugPlain.split("/");
    if (!courseSlug) courseSlug = maybeCourse;
    lessonSlugPlain = maybeLesson;
  }

  // Resolve course (by slug or by lesson membership)
  let currentCourse: CourseDef | undefined = courseSlug ? findCourse(courseSlug) : undefined;
  if (!currentCourse && lessonSlugPlain) {
    currentCourse = COURSES.find((c) => c.lessons.some((l) => l.slug === lessonSlugPlain));
  }

  // Resolve lesson within course
  const currentLesson: LessonDef | undefined =
    currentCourse?.lessons.find((l) => l.slug === lessonSlugPlain) ?? undefined;

  // Prev/Next refs
  const { prevLessonRef, nextLessonRef } = (() => {
    if (!currentCourse || !currentLesson)
      return { prevLessonRef: null, nextLessonRef: null };

    const idx = currentCourse.lessons.findIndex((l) => l.slug === currentLesson.slug);
    const prev = idx > 0 ? currentCourse.lessons[idx - 1] : null;
    const next = idx >= 0 && idx < currentCourse.lessons.length - 1
      ? currentCourse.lessons[idx + 1]
      : null;

    const toRef = (c: CourseDef, l: LessonDef) => ({
      slug: `${c.slug}/${l.slug}`,
      title: l.title,
      summary: l.summary,
    });

    return {
      prevLessonRef: prev ? toRef(currentCourse, prev) : null,
      nextLessonRef: next ? toRef(currentCourse, next) : null,
    };
  })();

  const onGoToPath = (slugPath: string) => router.push(`/courses/${slugPath}`);

  // Force a remount by adding a cache-busting repeat param and replacing the url
  const onRepeat = () => {
    const slugPath =
      currentCourse && currentLesson
        ? `${currentCourse.slug}/${currentLesson.slug}`
        : (typeof lessonSlug === "string" ? lessonSlug : "");
    if (slugPath) {
      router.replace(`/courses/${slugPath}?repeat=${Date.now()}`);
    } else {
      router.refresh();
    }
  };

  return (
    <CourseNavPanel
      currentLesson={
        currentCourse && currentLesson
          ? {
              slug: `${currentCourse.slug}/${currentLesson.slug}`,
              title: currentLesson.title,
              summary: currentLesson.summary,
            }
          : undefined
      }
      prevLesson={prevLessonRef ?? undefined}
      nextLesson={nextLessonRef ?? undefined}
      onGoTo={onGoToPath}
      onRepeat={onRepeat}
    />
  );
}
