// app/courses/[course]/page.tsx
import { notFound } from 'next/navigation';
import { COURSES, findCourse } from '@/lib/courses/registry';
import CoursesLayout from '@/components/courses/courses-layout';
import LessonsCard from '@/components/courses/lessons/card';

export const dynamicParams = false;

export async function generateStaticParams() {
  return COURSES.map((c) => ({ course: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course } = await params;
  const hit = findCourse(course);
  if (!hit) return {};
  return {
    title: `${hit.title} — Courses`,
    description: hit.subtitle ?? `${hit.title} course`,
  };
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course } = await params;
  const hit = findCourse(course);
  if (!hit) return notFound();

  return (
    <CoursesLayout title={hit.title}>
      {hit.subtitle && (
        <p className="mb-4 text-sm text-[#373737]">{hit.subtitle}</p>
      )}
      <LessonsCard
        courseSlug={hit.slug}
        lessons={hit.lessons}
        basePath={`/courses/${hit.slug}`}
      />
    </CoursesLayout>
  );
}
