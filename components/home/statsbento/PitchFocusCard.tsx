'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';

import { PolarArea, NOTE, clamp } from './pitch'; // ← compose from the subfolder

export default function PitchFocusCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const { recentIds, loading: baseLoading, error: baseErr } = useHomeResults();

  const [items, setItems] = React.useState<Array<{ label: string; v1: number; v2: number }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (baseLoading) { setLoading(true); setErr(baseErr ?? null); return; }

        setLoading(true); setErr(null);

        if (!recentIds.length) {
          if (!cancelled) { setItems([]); setLoading(false); setErr(baseErr ?? null); }
          return;
        }

        await ensureSessionReady(supabase, 2000);

        const pQ = await supabase
          .from('lesson_result_pitch_notes')
          .select('result_id, midi, n, ratio, cents_mae')
          .in('result_id', recentIds);

        if (pQ.error) throw pQ.error;

        const byMidi = new Map<number, { w: number; on: number; mae: number }>();
        for (const p of (pQ.data ?? []) as any[]) {
          const w = Math.max(1, Number(p.n || 1));
          const g = byMidi.get(p.midi) ?? { w: 0, on: 0, mae: 0 };
          const wt = g.w + w;
          g.on  = (g.on  * g.w + (p.ratio ?? 0)     * w) / wt;
          g.mae = (g.mae * g.w + (p.cents_mae ?? 0) * w) / wt;
          g.w   = wt;
          byMidi.set(p.midi, g);
        }

        const full = Array.from(byMidi.entries()).map(([m, v]) => ({
          midi: m,
          label: NOTE(m),
          v1: Math.round(v.on * 100),
          v2: Math.round(v.mae),
          score: (1 - clamp(v.on, 0, 1)) * 0.6 + Math.min(1, v.mae / 120) * 0.4,
        }));

        const topFragile = [...full].sort((a, b) => b.score - a.score).slice(0, 8);
        const midiOrdered = topFragile.sort((a, b) => a.midi - b.midi);

        if (!cancelled) {
          setItems(midiOrdered.map(({ label, v1, v2 }) => ({ label, v1, v2 })));
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, recentIds, baseLoading, baseErr]);

  const isLoading = baseLoading || loading;
  const errorMsg = baseErr || err;

  return (
    <div className="rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Pitch Focus</h3>
        <div className="text-sm text-[#0f0f0f] flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: PR_COLORS.noteFill }} />
            On-pitch %
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#3b82f6' }} />
            MAE ¢
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="h-[78%] mt-2 animate-pulse rounded-xl bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee]" />
      ) : items.length === 0 ? (
        <div className="h-[78%] mt-2 flex items-center justify-center text-base text-[#0f0f0f]">
          No per-note data yet.
        </div>
      ) : (
        <PolarArea items={items} max1={100} max2={120} />
      )}

      {errorMsg ? <div className="mt-3 text-sm text-[#dc2626]">{errorMsg}</div> : null}
    </div>
  );
}
