// hooks/progress/useLessonBests.ts
'use client';

import * as React from 'react';
import { COURSES } from '@/lib/courses/registry';

export type LessonBests = Record<string, number>; // "<course>/<lesson>" -> best final_percent

// Build lesson_slug -> set(courses) so we can safely namespace legacy rows
const LESSON_TO_COURSES: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  for (const c of COURSES) {
    for (const l of c.lessons) {
      const set = m.get(l.slug) ?? new Set<string>();
      set.add(c.slug);
      m.set(l.slug, set);
    }
  }
  return m;
})();

const isNamespaced = (s: string) => s.includes('/');

function uniqueCourseForLesson(slug: string): string | null {
  const s = LESSON_TO_COURSES.get(slug);
  if (!s || s.size !== 1) return null;
  for (const v of s) return v;
  return null;
}

type Row = { lesson_slug: string; final_percent: number };

export default function useLessonBests() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [bests, setBests] = React.useState<LessonBests>({});

  React.useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/progress/lesson-bests', {
          method: 'GET',
          credentials: 'include',
          signal: ac.signal,
        });

        if (res.status === 401) {
          // Not signed in; treat as empty.
          if (alive) setBests({});
          return;
        }
        if (!res.ok) {
          const msg = `HTTP ${res.status}`;
          throw new Error(msg);
        }

        const rows: Row[] = await res.json();

        if (!alive) return;

        const map: LessonBests = {};
        for (const r of rows ?? []) {
          const raw = String(r.lesson_slug ?? '').trim();
          if (!raw) continue;
          const pct = Number(r.final_percent ?? 0);

          if (isNamespaced(raw)) {
            // New rows: already "course/lesson"
            map[raw] = pct;
          } else {
            // Legacy rows: only map if the lesson slug belongs to exactly one course
            const onlyCourse = uniqueCourseForLesson(raw);
            if (onlyCourse) map[`${onlyCourse}/${raw}`] = pct;
            // If ambiguous, skip to avoid cross-course credit
          }
        }

        if (alive) setBests(map);
      } catch (e: any) {
        if (!alive || ac.signal.aborted) return;
        setError(e?.message || String(e));
        setBests({});
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, []);

  return { loading, error, bests };
}
