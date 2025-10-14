// components/home/statsbento/CoursesCard.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { COURSES } from '@/lib/courses/registry';
import useLessonBests from '@/hooks/progress/useLessonBests';
import { letterFromPercent } from '@/utils/scoring/grade';
import { PR_COLORS } from '@/utils/stage'; // noteFill (green)

const BLUE_COMPLETED = '#3b82f6';
const GRAY_IDLE = '#9ca3af';

function isPassed(pct: number) {
  const l = letterFromPercent(pct);
  return ['A', 'A-', 'B+', 'B', 'B-'].includes(l);
}
function isMastered(pct: number) {
  const l = letterFromPercent(pct);
  return ['A', 'A-'].includes(l);
}

type Progress = {
  total: number;
  started: number;
  completed: number;
  mastered: number;
  pct: number;
};

export default function CoursesCard() {
  const router = useRouter();
  const { loading, error, bests } = useLessonBests();

  const lessonsByCourse = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of COURSES) map.set(c.slug, c.lessons.map(l => l.slug));
    return map;
  }, []);

  const progressFor = React.useCallback((slug: string): Progress => {
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
  }, [bests, lessonsByCourse]);

  /** Fixed-size top-right chip; shows % complete.
   *  Dot color: green if any mastered, blue if started, gray if untouched.
   */
  const ProgressChip = ({ p }: { p: Progress }) => {
    const dotColor =
      p.mastered > 0 ? PR_COLORS.noteFill :
      p.started  > 0 ? BLUE_COMPLETED :
                       GRAY_IDLE;
    const label = `${p.pct}%`;
    return (
      <span
        className="inline-flex h-6 w-[88px] items-center justify-center gap-1 rounded-full
                   bg-white text-[11px] font-semibold leading-none tabular-nums
                   shadow-sm ring-1 ring-[#3b82f6] border border-transparent whitespace-nowrap"
        title={`${label} complete`}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: dotColor }} />
        <span className="truncate">{label}</span>
      </span>
    );
  };

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-6 shadow-sm flex flex-col">
      {/* Header (renamed) */}
      <div className="pb-3 border-b border-[#e5e7eb]">
        <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-[#0f0f0f]">
          Courses
        </h3>
      </div>

      {/* Body */}
      {loading ? (
        <div className="mt-3 flex-1 min-h-0">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-[#e8e8e8] animate-pulse" />
            ))}
          </div>
        </div>
      ) : COURSES.length === 0 ? (
        <div className="mt-3 flex-1 grid place-items-center text-base text-[#0f0f0f]">
          No courses available.
        </div>
      ) : (
        <div className="mt-3 flex-1 min-h-0">
          <ul role="list" aria-label="Course progress" className="h-full overflow-auto">
            <div className="space-y-2">
              {COURSES.map((c) => {
                const p = progressFor(c.slug);
                const rightDetail =
                  p.mastered > 0 ? `${p.mastered} mastered`
                  : p.started > p.completed ? `${p.started - p.completed} in progress`
                  : `${p.pct}%`;

                return (
                  <li key={c.slug} role="listitem">
                    <button
                      type="button"
                      onClick={() => router.push(`/courses/${c.slug}`)}
                      className="relative w-full text-left rounded-xl border bg-gradient-to-b from-[#fafafa] to-[#f8f8f8]
                                 px-4 py-3 pr-28 shadow-sm transition
                                 hover:shadow-md hover:border-[#dcdcdc]
                                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]"
                      style={{ borderColor: '#e5e7eb' }}
                      title={`${c.title} — ${p.completed}/${p.total} completed (${rightDetail})`}
                      aria-label={`${c.title}, ${p.completed} of ${p.total} completed, ${rightDetail}`}
                    >
                      {/* Chip pinned top-right, doesn't affect text layout */}
                      <div className="absolute top-2 right-4">
                        <ProgressChip p={p} />
                      </div>

                      {/* Left column: course title + progress line (preserve LessonsCard text styling) */}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#0f0f0f] truncate">{c.title}</div>
                        <div className="text-xs text-[#0f0f0f]/65">
                          {p.completed}/{p.total} completed • {rightDetail}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </div>
          </ul>
        </div>
      )}

      {error ? <div className="mt-3 text-sm text-[#dc2626]">{String(error)}</div> : null}
    </div>
  );
}
