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
  return ['A', 'A-', 'B+', 'B', 'B-'].includes(l);
}

export default function InProgressCard({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const go = (slug: string) => router.push(`/courses/${slug}`);
  const { bests, loading } = useLessonBests();

  const lessonsByCourse = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of REGISTRY) map.set(c.slug, c.lessons.map(l => l.slug));
    return map;
  }, []);

  const progressFor = React.useCallback((slug: string) => {
    const lessons = lessonsByCourse.get(slug) ?? [];
    const total = lessons.length;
    let completed = 0, started = 0;
    for (const ls of lessons) {
      const best = (bests ?? {})[ls];
      if (best != null) {
        started += 1;
        if (isPassed(best)) completed += 1;
      }
    }
    const pct = total ? Math.round((completed / total) * 100) : 0;
    return { total, started, completed, pct, remaining: Math.max(0, total - completed) };
  }, [bests, lessonsByCourse]);

  const items = React.useMemo(() => {
    const withProgress = courses.map(c => ({ c, p: progressFor(c.slug) }));
    return withProgress
      .filter(({ p }) => p.total > 0 && p.completed < p.total)
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

  // pre-typed CSS var so we don't need `as any`
  const btnStyle: React.CSSProperties & Record<'--tw-before-bg', string> = {
    '--tw-before-bg': PR_COLORS.noteFill,
  };

  // Wide stacked list — bigger type, dark text only, piano-roll accent
  return (
    <div className="grid grid-cols-1 gap-4 md:gap-5">
      {items.map(({ c, p }) => (
        <button
          key={c.slug}
          onClick={() => go(c.slug)}
          className={[
            'relative w-full text-left rounded-2xl border p-6 md:p-7',
            'bg-gradient-to-b from-white to-[#f7f7f7]',
            'border-[#d2d2d2] hover:shadow-md shadow-sm active:scale-[0.99] transition',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]',
            // left accent rail
            'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:rounded-l-2xl',
          ].join(' ')}
          style={btnStyle}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl"
            style={{ background: PR_COLORS.noteFill }}
            aria-hidden
          />
          <div className="flex items-center justify-between gap-6">
            {/* Left — title + meta */}
            <div className="min-w-0">
              <div className="text-sm uppercase tracking-wide text-[#0f0f0f]">
                Continue
              </div>
              <div className="mt-1 text-2xl font-semibold text-[#0f0f0f] truncate">
                {c.title}
              </div>
              {c.subtitle && (
                <div className="mt-1 text-base text-[#0f0f0f] truncate">
                  {c.subtitle}
                </div>
              )}

              {/* Meta chips */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium border"
                  style={{
                    background: '#fff',
                    color: '#0f0f0f',
                    borderColor: PR_COLORS.gridMinor,
                  }}
                >
                  {p.completed}/{p.total} completed
                </span>
                {p.remaining > 0 && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium border"
                    style={{
                      background: PR_COLORS.bg,
                      color: '#0f0f0f',
                      borderColor: PR_COLORS.gridMinor,
                    }}
                  >
                    {p.remaining} left
                  </span>
                )}
                {p.started > p.completed && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium border"
                    style={{
                      background: '#fff',
                      color: '#0f0f0f',
                      borderColor: PR_COLORS.gridMinor,
                    }}
                  >
                    In progress
                  </span>
                )}
              </div>
            </div>

            {/* Right — compact progress meter, larger number + thicker bar */}
            <div className="flex items-center gap-5 shrink-0">
              <div className="text-right">
                <div className="text-3xl font-semibold leading-none text-[#0f0f0f]">
                  {p.pct}%
                </div>
                <div className="mt-1 text-sm text-[#0f0f0f]">
                  course progress
                </div>
              </div>
              <div className="w-56">
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
                <div
                  className="mt-1 h-[2px] rounded-full"
                  style={{ background: PR_COLORS.gridMinor }}
                />
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
