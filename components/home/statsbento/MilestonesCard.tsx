// components/home/statsbento/MilestonesCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { letterFromPercent } from '@/utils/scoring/grade';
import { PR_COLORS } from '@/utils/stage';
import { COURSES } from '@/lib/courses/registry';

const PASSED = new Set(['A','A-','B+','B','B-']);
const MASTERED = new Set(['A','A-']);

const titleByLessonSlug: Record<string,string> = (() => {
  const m: Record<string,string> = {};
  for (const c of COURSES) for (const l of c.lessons) m[l.slug] = l.title;
  return m;
})();

export default function MilestonesCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [completedCount, setCompletedCount] = React.useState(0);
  const [masteredCount, setMasteredCount] = React.useState(0);
  const [recent, setRecent] = React.useState<Array<{ slug: string; title: string; pct: number; letter: string; when: string }>>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id; if (!uid) throw new Error('No user');

        // pull a decent slab, compute bests + recent passes
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
  }, [supabase]);

  return (
    <div
      className={[
        'relative rounded-2xl border p-6 shadow-sm',
        'bg-gradient-to-b from-white to-[#f7f7f7] border-[#d2d2d2]',
      ].join(' ')}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ background: PR_COLORS.noteFill }} />
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Completed Lessons</h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-medium text-[#0f0f0f]" style={{ borderColor: PR_COLORS.gridMinor, background: '#fff' }}>
            {completedCount} completed
          </span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-medium text-[#0f0f0f]" style={{ borderColor: PR_COLORS.noteFill, background: '#fff' }}>
            {masteredCount} mastered
          </span>
        </div>
      </div>

      {loading ? (
        <div className="h-[75%] mt-4 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : recent.length === 0 ? (
        <div className="h-[75%] mt-4 flex items-center justify-center text-base text-[#0f0f0f]">
          Complete a lesson to see it here.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2">
          {recent.map((r) => (
            <div
              key={r.slug}
              className="flex items-center justify-between rounded-xl border bg-white px-3 py-2"
              style={{ borderColor: '#dcdcdc' }}
              title={`${r.title} — ${r.when}`}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#0f0f0f] truncate">{r.title}</div>
                <div className="text-xs text-[#0f0f0f]">{r.when}</div>
              </div>
              <span className="inline-flex items-center gap-2">
                <span className="text-sm font-medium text-[#0f0f0f]">{r.pct}% ({r.letter})</span>
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: MASTERED.has(r.letter) ? PR_COLORS.noteFill : PR_COLORS.dotFill }} />
              </span>
            </div>
          ))}
        </div>
      )}
      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
