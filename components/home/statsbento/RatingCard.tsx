// components/home/statsbento/RatingCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';

export default function RatingCard({ compact = false }: { compact?: boolean }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [rating, setRating] = React.useState<{ value: number; delta: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id; if (!uid) throw new Error('No user');

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
  }, [supabase]);

  const deltaText =
    rating == null
      ? ''
      : rating.delta === 0
        ? '±0.0'
        : rating.delta > 0
          ? `+${rating.delta.toFixed(1)}`
          : `${rating.delta.toFixed(1)}`;

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-white to-[#f7f7f7] p-6 shadow-sm">
      {/* Row 1: title left, +/- right */}
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xl md:text-2xl font-semibold text-[#0f0f0f]">Rating</h3>
        {!loading && rating && (
          <div className="text-sm md:text-base text-[#0f0f0f]/80 tabular-nums">{deltaText}</div>
        )}
      </div>

      {/* Row 2: big value, left-aligned like the other cards */}
      {loading ? (
        <div className="h-[64%] mt-3 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : !rating ? (
        <div className="h-[64%] mt-3 flex items-center">
          <div className="text-sm md:text-base text-[#0f0f0f]/80">Play a lesson to get rated.</div>
        </div>
      ) : (
        <div className="h-[64%] mt-2 flex items-center">
          <div className="text-4xl font-semibold tracking-tight tabular-nums">{rating.value}</div>
        </div>
      )}

      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
