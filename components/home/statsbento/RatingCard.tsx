// components/home/statsbento/RatingCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { useHomeBootstrap } from '../HomeBootstrap';

export default function RatingCard({ compact = false }: { compact?: boolean }) {
  const supabase = React.useMemo(() => createClient(), []);
  const { uid } = useHomeBootstrap();

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [rating, setRating] = React.useState<{ value: number; delta: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);

        // Single query: pull recent events and compute latest-per-pool + best pool
        const evQ = await supabase
          .from('rating_events')
          .select('pool, period_end, rating_after, rating_before')
          .eq('uid', uid)
          .order('period_end', { ascending: false })
          .limit(1000);
        if (evQ.error) throw evQ.error;

        const rows = (evQ.data as any[] | null) ?? [];
        if (!rows.length) {
          if (!cancelled) setRating(null);
          return;
        }

        // Latest event per pool (since rows are desc by period_end)
        const latestByPool = new Map<string, { after: number; before: number }>();
        for (const r of rows) {
          const p = String(r.pool ?? '');
          if (!p || latestByPool.has(p)) continue;
          latestByPool.set(p, {
            after: Number(r.rating_after ?? 0),
            before: Number(r.rating_before ?? 0),
          });
        }

        if (!latestByPool.size) {
          if (!cancelled) setRating(null);
          return;
        }

        // Pick the pool with the highest current rating (rating_after)
        let bestPool: string | null = null;
        let bestAfter = -Infinity;
        let bestBefore = 0;
        for (const [pool, v] of latestByPool.entries()) {
          if (v.after >= bestAfter) {
            bestAfter = v.after;
            bestBefore = v.before;
            bestPool = pool;
          }
        }

        const value = Math.round(bestAfter);
        const delta = Math.round((bestAfter - bestBefore) * 10) / 10;

        if (!cancelled) setRating({ value, delta });
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, uid]);

  const deltaText =
    rating == null
      ? ''
      : rating.delta === 0
        ? '±0.0'
        : rating.delta > 0
          ? `+${rating.delta.toFixed(1)}`
          : `${rating.delta.toFixed(1)}`;

  const pad = compact ? 'p-4' : 'p-6';
  const titleCls = compact ? 'text-sm font-semibold' : 'text-xl md:text-2xl font-semibold';
  const valueCls = compact ? 'text-2xl font-semibold tracking-tight' : 'text-4xl font-semibold tracking-tight';
  const bodyH = compact ? 'h-[48%]' : 'h-[64%]';

  return (
    <div className={`h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-white to-[#f7f7f7] ${pad} shadow-sm`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`${titleCls} text-[#0f0f0f]`}>Rating</h3>
        {!loading && rating && (
          <div className={`text-[#0f0f0f]/80 tabular-nums ${compact ? 'text-xs' : 'text-sm md:text-base'}`}>{deltaText}</div>
        )}
      </div>

      {loading ? (
        <div className={`${bodyH} mt-2 animate-pulse rounded-xl ${compact ? 'bg-[#efefef]' : 'bg-[#e8e8e8]'}`} />
      ) : !rating ? (
        <div className={`${bodyH} mt-2 flex items-center`}>
          <div className={`${compact ? 'text-xs' : 'text-sm md:text-base'} text-[#0f0f0f]/80`}>Play a lesson to get rated.</div>
        </div>
      ) : (
        <div className={`${bodyH} mt-1 flex items-center`}>
          <div className={`${valueCls}`}>{rating.value}</div>
        </div>
      )}

      {err ? <div className={`${compact ? 'mt-1 text-[11px]' : 'mt-3 text-sm'} text-[#dc2626]`}>{err}</div> : null}
    </div>
  );
}
