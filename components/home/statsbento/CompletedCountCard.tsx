// components/home/statsbento/CompletedCountCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { letterFromPercent } from '@/utils/scoring/grade';

const PASSED = new Set(['A','A-','B+','B','B-']);

export default function CompletedCountCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [count, setCount] = React.useState<number>(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id; if (!uid) throw new Error('No user');

        const { data, error } = await supabase
          .from('lesson_results')
          .select('lesson_slug, final_percent')
          .eq('uid', uid)
          .order('created_at', { ascending: false })
          .limit(400);
        if (error) throw error;

        const bestBy: Record<string, number> = {};
        for (const r of (data ?? []) as any[]) {
          const slug = String(r.lesson_slug ?? '');
          const pct = Number(r.final_percent ?? 0);
          if (!slug) continue;
          bestBy[slug] = Math.max(bestBy[slug] ?? 0, pct);
        }
        const completed = Object.values(bestBy).filter(v => PASSED.has(letterFromPercent(v))).length;
        if (!cancelled) setCount(completed);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-[#fcfcfc] p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-semibold text-[#0f0f0f]">Completed</h3>
        {/* subtitle removed */}
      </div>
      {loading ? (
        <div className="h-[64%] mt-3 animate-pulse rounded-xl bg-[#efefef]" />
      ) : (
        <div className="h-[64%] mt-2 flex items-center">
          <div className="text-3xl font-semibold tracking-tight">{count}</div>
        </div>
      )}
      {err ? <div className="mt-2 text-xs text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
