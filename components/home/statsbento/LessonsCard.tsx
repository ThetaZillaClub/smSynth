// components/home/statsbento/LessonsCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { letterFromPercent } from '@/utils/scoring/grade';
import { PR_COLORS } from '@/utils/stage';
import { COURSES } from '@/lib/courses/registry';
import { useHomeBootstrap } from '@/components/home/HomeBootstrap';

const PASSED = new Set(['A','A-','B+','B','B-']);
const MASTERED = new Set(['A','A+']); // A- is NOT mastery
const BLUE_COMPLETED = '#3b82f6'; // RhythmRoll blue

const titleByLessonSlug: Record<string,string> = (() => {
  const m: Record<string,string> = {};
  for (const c of COURSES) for (const l of c.lessons) m[l.slug] = l.title;
  return m;
})();

export default function LessonsCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const { uid } = useHomeBootstrap();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [completedCount, setCompletedCount] = React.useState(0);
  const [masteredCount, setMasteredCount] = React.useState(0);
  const [recent, setRecent] = React.useState<
    Array<{ slug: string; title: string; pct: number; letter: string; when: string }>
  >([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        // allow auth to hydrate tokens for RLS; do not call getUser (uid is from bootstrap)
        await ensureSessionReady(supabase, 2000);

        const { data, error } = await supabase
          .from('lesson_results')
          .select('lesson_slug, created_at, final_percent')
          .eq('uid', uid)
          .order('created_at', { ascending: false })
          .limit(400);
        if (error) throw error;

        const bestBy: Record<string, number> = {};
        const recentPasses: Array<{ slug: string; pct: number; letter: string; when: string }> = [];
        const seen = new Set<string>();

        for (const r of (data ?? []) as any[]) {
          const slug = String(r.lesson_slug ?? '');
          const pct = Number(r.final_percent ?? 0);
          if (slug) bestBy[slug] = Math.max(bestBy[slug] ?? 0, pct);

          if (!seen.has(slug)) {
            const letter = letterFromPercent(pct);
            if (PASSED.has(letter)) {
              seen.add(slug);
              recentPasses.push({
                slug,
                pct: Math.round(pct),
                letter,
                when: new Date(r.created_at).toISOString().slice(0, 10),
              });
            }
          }
          if (recentPasses.length >= 6) break;
        }

        const completed = Object.values(bestBy).filter(v => PASSED.has(letterFromPercent(v))).length;
        const mastered = Object.values(bestBy).filter(v => MASTERED.has(letterFromPercent(v))).length;

        if (!cancelled) {
          setCompletedCount(completed);
          setMasteredCount(mastered);
          setRecent(recentPasses.map(x => ({ ...x, title: titleByLessonSlug[x.slug] ?? x.slug })));
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, uid]);

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-white to-[#f7f7f7] p-6 shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Completed Lessons</h3>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-[#0f0f0f] whitespace-nowrap leading-tight"
            style={{ borderColor: '#dcdcdc', background: '#fff' }}
            title={`${completedCount} completed`}
          >
            {completedCount} completed
          </span>
          <span
            className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-[#0f0f0f] whitespace-nowrap leading-tight"
            style={{ borderColor: PR_COLORS.noteFill, background: '#fff' }}
            title={`${masteredCount} mastered`}
          >
            {masteredCount} mastered
          </span>
        </div>
      </div>

      {/* Body fills remaining height */}
      {loading ? (
        <div className="mt-3 flex-1 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : recent.length === 0 ? (
        <div className="mt-3 flex-1 grid place-items-center text-base text-[#0f0f0f]">
          Complete a lesson to see it here.
        </div>
      ) : (
        <div className="mt-3 flex-1 min-h-0">
          <div className="h-full overflow-auto">
            <div className="space-y-2">
              {recent.map((r) => (
                <div
                  key={r.slug}
                  className="flex items-center justify-between rounded-lg border bg-white px-3 py-2"
                  style={{ borderColor: '#e5e7eb' }}
                  title={`${r.title} — ${r.when}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0f0f0f] truncate">{r.title}</div>
                    <div className="text-xs text-[#0f0f0f]/80">{r.when}</div>
                  </div>
                  <span className="inline-flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium text-[#0f0f0f]">{r.pct}% ({r.letter})</span>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ background: MASTERED.has(r.letter) ? PR_COLORS.noteFill : BLUE_COMPLETED }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
