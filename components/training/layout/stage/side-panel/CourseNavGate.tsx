"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { COURSES, findCourse } from "@/lib/courses/registry";
import type { CourseDef, LessonDef } from "@/lib/courses/types";
import CourseNavPanel from "./CourseNavPanel";

export default function CourseNavGate({
  courseSlugParam,
  lessonSlug,
  sessionComplete,
}: {
  courseSlugParam?: string;
  lessonSlug?: string | null;
  sessionComplete: boolean;
}) {
  const router = useRouter();

  if (!sessionComplete) return null;

  let currentCourse: CourseDef | undefined = courseSlugParam
    ? findCourse(courseSlugParam)
    : undefined;

  if (!currentCourse && lessonSlug) {
    currentCourse = COURSES.find((c) => c.lessons.some((l) => l.slug === lessonSlug));
  }

  const currentLesson: LessonDef | undefined =
    currentCourse?.lessons.find((l) => l.slug === lessonSlug) ?? undefined;

  const { prevLessonRef, nextLessonRef } = (() => {
    if (!currentCourse || !currentLesson)
      return { prevLessonRef: null, nextLessonRef: null };
    const idx = currentCourse.lessons.findIndex((l) => l.slug === currentLesson.slug);
    const prev = idx > 0 ? currentCourse.lessons[idx - 1] : null;
    const next =
      idx >= 0 && idx < currentCourse.lessons.length - 1
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
  const onRepeat = () => router.refresh();

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
