// app/courses/[course]/[lesson]/page.tsx
import { notFound } from 'next/navigation';
import { COURSES, findLesson } from '@/lib/courses/registry';
import LessonClient from '@/components/courses/lessonClient';

export const dynamicParams = false;

export async function generateStaticParams() {
  return COURSES.flatMap((c) =>
    c.lessons.map((l) => ({ course: c.slug, lesson: l.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string; lesson: string }>;
}) {
  const { course, lesson } = await params;
  const hit = findLesson(course, lesson);
  if (!hit) return {};
  return {
    title: `${hit.course.title} — ${hit.lesson.title}`,
    description: hit.lesson.summary ?? hit.course.subtitle ?? undefined,
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ course: string; lesson: string }>;
}) {
  const { course, lesson } = await params;
  const hit = findLesson(course, lesson);
  if (!hit) return notFound();

  return (
    <LessonClient
      courseTitle={hit.course.title}
      lessonTitle={hit.lesson.title}
      lessonConfig={hit.lesson.config}
    />
  );
}
