// components/home/statsbento/CoursesCard.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { COURSES } from '@/lib/courses/registry';
import useLessonBests from '@/hooks/progress/useLessonBests';
import { letterFromPercent } from '@/utils/scoring/grade';
import { PR_COLORS } from '@/utils/stage';

const GRAY_IDLE = '#d1d5db';     // dot when nothing started
const GRAY_PROGRESS = '#6b7280'; // dot when in progress (gray-500)

function isPassed(pct: number) {
  const l = letterFromPercent(pct);
  return ['A+', 'A', 'A-', 'B+', 'B', 'B-'].includes(l);
}
function isMastered(pct: number) {
  const l = letterFromPercent(pct);
  // A+ and A = mastery; A- is not
  return ['A+', 'A'].includes(l);
}

type Progress = {
  total: number;
  started: number;
  completed: number;
  mastered: number;
  pct: number;
};

// Precompute plain-slug uniqueness so we can safely fall back for legacy keys
const UNIQUE_SLUG = (() => {
  const counts = new Map<string, number>();
  for (const c of COURSES) for (const l of c.lessons) {
    counts.set(l.slug, (counts.get(l.slug) ?? 0) + 1);
  }
  const uniq = new Map<string, boolean>();
  for (const [slug, n] of counts) uniq.set(slug, n === 1);
  return uniq;
})();

export default function CoursesCard() {
  const router = useRouter();
  const { loading, error, bests } = useLessonBests();

  const lessonsByCourse = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of COURSES) map.set(c.slug, c.lessons.map(l => l.slug));
    return map;
  }, []);

  const progressFor = React.useCallback((courseSlug: string): Progress => {
    const lessons = lessonsByCourse.get(courseSlug) ?? [];
    const total = lessons.length;
    if (!total) return { total: 0, started: 0, completed: 0, mastered: 0, pct: 0 };

    let started = 0, completed = 0, mastered = 0;
    for (const ls of lessons) {
      // Prefer namespaced key; fall back to plain slug only if unique
      const namespaced = `${courseSlug}/${ls}`;
      const best =
        (bests ?? {})[namespaced] ??
        (UNIQUE_SLUG.get(ls) ? (bests as any)[ls] : undefined);

      if (best != null) {
        started += 1;
        if (isPassed(best)) completed += 1;
        if (isMastered(best)) mastered += 1;
      }
    }
    const pct = Math.round((completed / total) * 100);
    return { total, started, completed, mastered, pct };
  }, [bests, lessonsByCourse]);

  /** Neutral, fixed-width progress tag (consistent size at 0%–100%) */
  const ProgressTag = ({ p }: { p: Progress }) => {
    const dotColor =
      p.mastered > 0 ? PR_COLORS.noteFill :
      p.started  > 0 ? GRAY_PROGRESS :
                       GRAY_IDLE;
    const label = `${p.pct}%`;
    return (
      <span
        className={[
          'inline-flex items-center justify-center gap-1 rounded-full',
          'h-6 w-[72px] px-2 text-[11px] font-medium leading-none tabular-nums whitespace-nowrap',
          'bg-[#f9f9f9] text-[#0f0f0f] border border-[#d7d7d7]',
        ].join(' ')}
        title={`${label} complete`}
        aria-label={`${label} complete`}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: dotColor }} />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-6 shadow-sm flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold tracking-tight text-[#0f0f0f]">Courses</h3>
      </div>

      {loading ? (
        <div className="mt-2 flex-1 min-h-0">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-[#e8e8e8] animate-pulse" />
            ))}
          </div>
        </div>
      ) : COURSES.length === 0 ? (
        <div className="mt-2 flex-1 grid place-items-center text-base text-[#0f0f0f]">
          No courses available.
        </div>
      ) : (
        <div className="mt-2 flex-1 min-h-0">
          <ul role="list" aria-label="Course progress" className="h-full overflow-auto">
            <div className="space-y-2">
              {COURSES.map((c) => {
                const p = progressFor(c.slug);
                const suffix =
                  p.mastered > 0 ? `${p.mastered} mastered`
                  : p.started > p.completed ? `${p.started - p.completed} in progress`
                  : '';
                const percentLabel = `${p.pct}%`;

                return (
                  <li key={c.slug} role="listitem">
                    <button
                      type="button"
                      onClick={() => router.push(`/courses/${c.slug}`)}
                      className="relative w-full text-left rounded-xl border bg-gradient-to-b from-[#fafafa] to-[#f8f8f8]
                                 px-4 py-3 pr-28 transition shadow-sm
                                 hover:shadow-md hover:border-[#dcdcdc]
                                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]"
                      style={{ borderColor: '#e5e7eb' }}
                      title={`${c.title} — ${p.completed}/${p.total} completed (${percentLabel})`}
                      aria-label={`${c.title}, ${p.completed} of ${p.total} completed, ${percentLabel}`}
                    >
                      <div className="absolute top-2 right-4">
                        <ProgressTag p={p} />
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#0f0f0f] truncate">{c.title}</div>
                        <div className="text-xs text-[#0f0f0f]/65">
                          {p.completed}/{p.total} completed{suffix ? ` • ${suffix}` : ''}
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
