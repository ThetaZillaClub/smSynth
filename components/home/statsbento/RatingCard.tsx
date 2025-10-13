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

        const [ratings, events] = await Promise.all([
          supabase.from('player_ratings').select('pool, rating').eq('uid', uid),
          supabase.from('rating_events')
            .select('pool, period_end, rating_after, rating_before')
            .eq('uid', uid)
            .order('period_end', { ascending: false })
            .limit(100),
        ]);
        if (ratings.error) throw ratings.error;
        if (events.error) throw events.error;

        const all = (ratings.data as any[] | null) ?? [];
        if (!all.length) { if (!cancelled) setRating(null); return; }

        const best = all.reduce((a, b) => (a.rating >= b.rating ? a : b));
        let delta = 0;
        const ev = (events.data as any[] | null)?.find(e => e.pool === best.pool);
        if (ev) delta = Math.round((ev.rating_after - ev.rating_before) * 10) / 10;

        if (!cancelled) setRating({ value: Math.round(best.rating), delta });
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
