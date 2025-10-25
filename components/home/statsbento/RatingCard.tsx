// components/home/statsbento/RatingCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { useHomeBootstrap } from '../HomeBootstrap';
import { PR_COLORS } from '@/utils/stage';

type RatingEventRow = {
  pool: string | null;
  period_end: string | null;
  rating_after: number | null;
  rating_before: number | null;
};

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

        const evQ = await supabase
          .from('rating_events')
          .select('pool, period_end, rating_after, rating_before')
          .eq('uid', uid)
          .order('period_end', { ascending: false })
          .limit(1000);
        if (evQ.error) throw evQ.error;

        const rows: RatingEventRow[] = (evQ.data ?? []) as RatingEventRow[];
        if (!rows.length) {
          if (!cancelled) setRating(null);
          return;
        }

        // Latest per pool
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

        // Pick pool with highest current rating
        let bestAfter = -Infinity;
        let bestBefore = 0;
        for (const [, v] of latestByPool.entries()) {
          if (v.after >= bestAfter) {
            bestAfter = v.after;
            bestBefore = v.before;
          }
        }

        const value = Math.round(bestAfter);
        const delta = Math.round((bestAfter - bestBefore) * 10) / 10;

        if (!cancelled) setRating({ value, delta });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setErr(msg);
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

  // Delta colors
  const DELTA_RED = '#dc2626';
  const DELTA_NEUTRAL = '#6b7280';
  const deltaColor =
    rating == null
      ? DELTA_NEUTRAL
      : rating.delta > 0
        ? PR_COLORS.noteFill
        : rating.delta < 0
          ? DELTA_RED
          : DELTA_NEUTRAL;

  const pad = compact ? 'p-4' : 'p-6';
  const titleCls = compact ? 'text-sm font-semibold' : 'text-xl md:text-2xl font-semibold';
  const valueCls = compact ? 'text-2xl font-semibold tracking-tight' : 'text-4xl font-semibold tracking-tight';
  // ↓ slightly smaller than before
  const deltaCls = compact ? 'text-lg font-semibold tracking-tight' : 'text-xl font-semibold tracking-tight';
  const bodyH = compact ? 'h-[48%]' : 'h-[64%]';

  return (
    <div className={`h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] ${pad} shadow-sm`}>
      {/* Row 1: title */}
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`${titleCls} text-[#0f0f0f]`}>Rating</h3>
      </div>

      {/* Row 2: rating + smaller colored delta (baseline-aligned) */}
      {loading ? (
        <div className={`${bodyH} mt-2 animate-pulse rounded-xl ${compact ? 'bg-[#efefef]' : 'bg-[#e8e8e8]'}`} />
      ) : !rating ? (
        <div className={`${bodyH} mt-2 flex items-center`}>
          <div className={`${compact ? 'text-xs' : 'text-sm md:text-base'} text-[#0f0f0f]/80`}>Play a lesson to get rated.</div>
        </div>
      ) : (
        <div className={`${bodyH} mt-1 flex items-center`}>
          <div className="flex items-baseline gap-3">
            <div className={`${valueCls} tabular-nums leading-none`}>{rating.value}</div>
            <div
              className={`${deltaCls} tabular-nums leading-none`}
              style={{ color: deltaColor }}
              aria-label={`Change ${deltaText}`}
              title={`Change ${deltaText}`}
            >
              {deltaText}
            </div>
          </div>
        </div>
      )}

      {/* Row 3: error */}
      {err ? <div className={`${compact ? 'mt-1 text-[11px]' : 'mt-3 text-sm'} text-[#dc2626]`}>{err}</div> : null}
    </div>
  );
}
