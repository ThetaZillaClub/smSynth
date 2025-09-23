'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import StarInput from './StarInput';

export default function RateModel({ modelId }: { modelId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [myRating, setMyRating] = useState<number>(0);
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;

      if (uid) {
        const { data: myRows, error: myErr } = await supabase
          .from('model_ratings')
          .select('rating')
          .eq('model_id', modelId)
          .eq('rater_uid', uid)
          .maybeSingle();
        if (!myErr && myRows?.rating) setMyRating(myRows.rating);
      }

      const { data: m, error: mErr } = await supabase
        .from('models')
        .select('rating_avg, rating_count')
        .eq('id', modelId)
        .maybeSingle();

      if (!mErr && m) {
        setAvg(m.rating_avg);
        setCount(m.rating_count);
      }
    })();
  }, [modelId, supabase]);

  const handleRate = useCallback(
    async (newRating: number) => {
      setBusy(true);
      setErr(null);
      try {
        const { error } = await supabase.rpc('rate_model', {
          p_model_id: modelId,
          p_rating: newRating,
        });
        if (error) throw error;
        setMyRating(newRating);

        const { data: m, error: mErr } = await supabase
          .from('models')
          .select('rating_avg, rating_count')
          .eq('id', modelId)
          .maybeSingle();
        if (mErr) throw mErr;
        setAvg(m?.rating_avg ?? null);
        setCount(m?.rating_count ?? 0);
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to rate');
      } finally {
        setBusy(false);
      }
    },
    [modelId, supabase]
  );

  return (
    <section className="w-full rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-6">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="text-xs uppercase tracking-wide text-[#6b6b6b]">Rate this model</div>
        <StarInput value={myRating} onChange={handleRate} />
        <button
          type="button"
          onClick={() => handleRate(myRating)}
          disabled={busy || myRating < 1}
          className="h-9 px-4 rounded-md bg-[#d2d2d2] text-[#0f0f0f] hover:bg-[#c8c8c8] disabled:opacity-60"
          title="Save rating"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <div className="text-sm text-[#373737]" aria-live="polite">
          Average: <strong>{avg ?? '—'}</strong> • Ratings: <strong>{count}</strong>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </section>
  );
}
