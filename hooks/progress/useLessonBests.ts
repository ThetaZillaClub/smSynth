// hooks/progress/useLessonBests.ts
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
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

export default function useLessonBests() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [bests, setBests] = React.useState<LessonBests>({});

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) { if (!cancelled) setBests({}); return; }

        // Current schema: only lesson_slug (now namespaced) + final_percent
        const q = await supabase
          .from('lesson_bests')
          .select('lesson_slug, final_percent')
          .eq('uid', uid);

        if (q.error) throw q.error;

        const map: LessonBests = {};
        for (const row of q.data ?? []) {
          const raw = String((row as any).lesson_slug ?? '').trim();
          if (!raw) continue;
          const pct = Number((row as any).final_percent ?? 0);

          if (isNamespaced(raw)) {
            // New rows: already "course/lesson"
            map[raw] = pct;
          } else {
            // Legacy rows: only map if the lesson slug belongs to exactly one course
            const onlyCourse = uniqueCourseForLesson(raw);
            if (onlyCourse) {
              map[`${onlyCourse}/${raw}`] = pct;
            }
            // If ambiguous, skip to avoid cross-course credit
          }
        }

        if (!cancelled) setBests(map);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return { loading, error, bests };
}
