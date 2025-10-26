// components/courses/in-progress/card.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Course } from '@/app/courses/page';
import { COURSES as REGISTRY } from '@/lib/courses/registry';
import useLessonBests from '@/hooks/progress/useLessonBests';
import { letterFromPercent } from '@/utils/scoring/grade';
import { PR_COLORS } from '@/utils/stage/theme';

function isPassed(pct: number) {
  const l = letterFromPercent(pct);
  return ['A+', 'A', 'A-', 'B+', 'B', 'B-'].includes(l);
}

// Precompute whether a plain lesson slug is unique across all courses.
const UNIQUE_SLUG = (() => {
  const counts = new Map<string, number>();
  for (const c of REGISTRY) for (const l of c.lessons) {
    counts.set(l.slug, (counts.get(l.slug) ?? 0) + 1);
  }
  const uniq = new Map<string, boolean>();
  for (const [slug, n] of counts) uniq.set(slug, n === 1);
  return uniq;
})();

export default function InProgressCard({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const go = (slug: string) => router.push(`/courses/${slug}`);
  const { bests, loading } = useLessonBests();

  const bestsMap: Record<string, number> = React.useMemo(
    () => (bests ?? {}) as Record<string, number>,
    [bests]
  );

  const lessonsByCourse = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of REGISTRY) map.set(c.slug, c.lessons.map(l => l.slug));
    return map;
  }, []);

  const progressFor = React.useCallback((courseSlug: string) => {
    const lessons = lessonsByCourse.get(courseSlug) ?? [];
    const total = lessons.length;
    let completed = 0, started = 0;

    for (const ls of lessons) {
      const namespaced = `${courseSlug}/${ls}`;
      const best =
        bestsMap[namespaced] ??
        (UNIQUE_SLUG.get(ls) ? bestsMap[ls] : undefined);

      if (best != null) {
        started += 1;
        if (isPassed(best)) completed += 1;
      }
    }

    const pct = total ? Math.round((completed / total) * 100) : 0;
    return { total, started, completed, pct, remaining: Math.max(0, total - completed) };
  }, [bestsMap, lessonsByCourse]);

  const items = React.useMemo(() => {
    const withProgress = courses.map(c => ({ c, p: progressFor(c.slug) }));
    return withProgress
      .filter(({ p }) => p.total > 0 && p.started > 0 && p.completed < p.total)
      .sort((a, b) => a.p.pct - b.p.pct);
  }, [courses, progressFor]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[#dcdcdc] bg-[#f2f2f2] p-5 shadow-sm">
        <div className="h-6 w-40 bg-[#e8e8e8] rounded mb-3 animate-pulse" />
        <div className="h-24 bg-[#e8e8e8] rounded animate-pulse" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[#dcdcdc] bg-[#f2f2f2] p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-[#0f0f0f]">You’re all caught up</h3>
        <p className="mt-1 text-sm text-[#0f0f0f]">
          No courses in progress. Browse <em>All courses</em> to start something new.
        </p>
      </div>
    );
  }

  const btnStyle: React.CSSProperties & Record<'--tw-before-bg', string> = {
    '--tw-before-bg': PR_COLORS.noteFill,
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6">
      {items.map(({ c, p }) => (
        <button
          key={c.slug}
          onClick={() => go(c.slug)}
          className={[
            'relative w-full text-left rounded-r-2xl rounded-l-lg border py-6 px-6 md:px-7', // ➜ extra L/R padding, Y kept the same
            'border bg-gradient-to-b from-[#fafafa] to-[#f8f8f8]',
            'border-[#d2d2d2] hover:shadow-md shadow-sm active:scale-[0.99] transition',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]',
            'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:rounded-l-lg',
          ].join(' ')}
          style={btnStyle}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg"
            style={{ background: PR_COLORS.noteFill }}
            aria-hidden
          />

          {/* Shared 3-row grid; Row 3 is dedicated solely to the progress bar */}
          <div className="grid grid-cols-[minmax(0,1fr)_14rem] grid-rows-[auto_auto_auto] gap-x-7 gap-y-2">
            {/* Row 1 — Left: title with "lessons remaining" chip appended inline */}
            <div className="col-[1] row-[1] self-center min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-2xl font-semibold text-[#0f0f0f] truncate">
                  {c.title}
                </div>
                {p.remaining > 0 && (
                  <span
                    className="shrink-0 inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-medium border"
                    style={{
                      background: '#fdfdfd',
                      color: '#0f0f0f',
                      borderColor: PR_COLORS.gridMinor,
                    }}
                  >
                    {p.remaining} lessons remaining
                  </span>
                )}
              </div>
            </div>

            {/* Row 1 — Right: percent */}
            <div className="col-[2] row-[1] self-center text-right text-3xl font-semibold leading-none text-[#0f0f0f]">
              {p.pct}%
            </div>

            {/* Row 2 — Left: subtitle or placeholder */}
            {c.subtitle ? (
              <div className="col-[1] row-[2] self-center min-w-0 text-base text-[#0f0f0f] truncate -mt-1">
                {c.subtitle}
              </div>
            ) : (
              <div className="col-[1] row-[2] self-center h-5 -mt-0.5" aria-hidden />
            )}

            {/* Row 2 — Right: x/x completed */}
            <div className="col-[2] row-[2] self-center text-right text-sm text-[#0f0f0f] -mt-0.5">
              {p.completed}/{p.total} completed
            </div>

            {/* Row 3 — Progress bar spans full width (its own row) */}
            <div className="col-[1/_-1] row-[3] self-center mt-6">
              <div
                className="h-3 rounded-full overflow-hidden"
                style={{ background: PR_COLORS.gridMinor }}
              >
                <div
                  className="h-full transition-[width] duration-500"
                  style={{
                    width: `${p.pct}%`,
                    background: PR_COLORS.noteFill,
                  }}
                />
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
