// components/courses/all-courses/card.tsx
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
function isMastered(pct: number) {
  const l = letterFromPercent(pct);
  return ['A', 'A-'].includes(l);
}

export default function AllCoursesCard({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const go = (slug: string) => router.push(`/courses/${slug}`);
  const { bests } = useLessonBests();

  const lessonsByCourse = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of REGISTRY) map.set(c.slug, c.lessons.map(l => l.slug));
    return map;
  }, []);

  const progressFor = (slug: string) => {
    const lessons = lessonsByCourse.get(slug) ?? [];
    const total = lessons.length;
    if (!total) return { total: 0, started: 0, completed: 0, mastered: 0, pct: 0 };

    let started = 0, completed = 0, mastered = 0;
    for (const ls of lessons) {
      const best = (bests ?? {})[ls];
      if (best != null) {
        started += 1;
        if (isPassed(best)) completed += 1;
        if (isMastered(best)) mastered += 1;
      }
    }
    const pct = Math.round((completed / total) * 100);
    return { total, started, completed, mastered, pct };
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-5">
        {courses.map((c) => {
          const p = progressFor(c.slug);
          return (
            <button
              key={c.slug}
              onClick={() => go(c.slug)}
              className={[
                'group text-left rounded-xl border',
                'bg-gradient-to-b from-white to-[#f7f7f7]',
                'border-[#dcdcdc] aspect-[3/2] min-h-[240px]',
                'p-5 md:p-6 flex flex-col items-start justify-between',
                'hover:shadow-md shadow-sm active:scale-[0.99] transition',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]',
              ].join(' ')}
            >
              <div>
                <div className="text-xl md:text-2xl font-semibold text-[#0f0f0f]">
                  {c.title}
                </div>
                {c.subtitle && (
                  <div className="text-sm md:text-base text-[#0f0f0f] mt-1">
                    {c.subtitle}
                  </div>
                )}
              </div>

              {/* Progress footer — piano-roll colors, larger type + thicker bar */}
              <div className="w-full">
                <div className="flex items-center justify-between text-sm md:text-base text-[#0f0f0f] mb-2">
                  <span>{p.completed}/{p.total} completed</span>
                  {p.mastered > 0 ? (
                    <span style={{ color: PR_COLORS.noteFill }}>{p.mastered} mastered</span>
                  ) : p.started > p.completed ? (
                    <span>{p.started - p.completed} in progress</span>
                  ) : (
                    <span>{p.pct}%</span>
                  )}
                </div>
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
