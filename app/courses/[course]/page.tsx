// app/courses/[course]/page.tsx
import { notFound } from 'next/navigation';
import { findCourse } from '@/lib/courses/registry';
import CoursesLayout from '@/components/courses/courses-layout';
import LessonsCard from '@/components/courses/lessons/card';

export default async function CoursePage({
  // NOTE: In newer Next.js, params is a Promise; awaiting also works in older versions.
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
