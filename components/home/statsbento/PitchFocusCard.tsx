// components/home/statsbento/PitchFocusCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';

import { PolarArea, NOTE, clamp } from './pitch';

type PitchNoteRow = {
  result_id: string;                    // uuid
  midi: number;                         // int
  n: number | string | null;            // numeric may arrive as string
  ratio: number | string | null;        // numeric may arrive as string
  cents_mae: number | string | null;    // numeric may arrive as string
};

export default function PitchFocusCard({
  frameless = false,
  fill = false,
  className = '',
  maxNotes = 16,
}: {
  frameless?: boolean;
  fill?: boolean;
  className?: string;
  /** Max notes to render; set high to effectively show all. */
  maxNotes?: number;
}) {
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

        type Row = {
          result_id: string; midi: number;
          n: number | string | null; ratio: number | string | null; cents_mae: number | string | null;
        };
        const rows: Row[] = (pQ.data ?? []) as Row[];

        const byMidi = new Map<number, { w: number; on: number; mae: number }>();
        for (const p of rows) {
          const midi = Number(p.midi);
          if (!Number.isFinite(midi)) continue;

          const nRaw = p.n == null ? 1 : Number(p.n);
          const ratioRaw = p.ratio == null ? 0 : Number(p.ratio);
          const maeRaw = p.cents_mae == null ? 0 : Number(p.cents_mae);

          const w = Math.max(1, Math.round(Number.isFinite(nRaw) ? nRaw : 1));
          const on = clamp(Number.isFinite(ratioRaw) ? ratioRaw : 0, 0, 1);
          const mae = Math.max(0, Number.isFinite(maeRaw) ? maeRaw : 0);

          const g = byMidi.get(midi) ?? { w: 0, on: 0, mae: 0 };
          const wt = g.w + w;
          const onAvg = (g.on * g.w + on * w) / wt;
          const maeAvg = (g.mae * g.w + mae * w) / wt;
          byMidi.set(midi, { w: wt, on: onAvg, mae: maeAvg });
        }

        const full = Array.from(byMidi.entries()).map(([m, v]) => ({
          midi: m,
          label: NOTE(m),
          v1: Math.round(clamp(v.on, 0, 1) * 100), // On-pitch %
          v2: Math.round(v.mae),                   // MAE ¢
          score: (1 - clamp(v.on, 0, 1)) * 0.6 + Math.min(1, v.mae / 120) * 0.4,
        }));

        const itemsForChart = (() => {
          if (full.length <= Math.max(1, maxNotes)) {
            return [...full].sort((a, b) => a.midi - b.midi);
          }
          const topFragile = [...full].sort((a, b) => b.score - a.score).slice(0, Math.max(1, maxNotes));
          return topFragile.sort((a, b) => a.midi - b.midi);
        })();

        if (!cancelled) {
          setItems(itemsForChart.map(({ label, v1, v2 }) => ({ label, v1, v2 })));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [supabase, recentIds, baseLoading, baseErr, maxNotes]);

  const isLoading = baseLoading || loading;
  const errorMsg = baseErr || err;

  const Inner = () => (
    <div className={fill ? 'h-full flex flex-col' : undefined}>
      {isLoading ? (
        <div className="mt-2 w-full h-full min-h-[240px] animate-pulse rounded-xl bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee]" />
      ) : items.length === 0 ? (
        <div className="mt-2 w-full h-full min-h-[240px] flex items-center justify-center text-base text-[#0f0f0f] rounded-xl bg-[#f5f5f5]">
          No per-note data yet.
        </div>
      ) : (
        <div className={`mt-2 ${fill ? 'flex-1 min-h-0' : ''}`}>
          <div className={`${fill ? 'h-full' : ''} w-full`}>
            <div className={`${fill ? 'h-full aspect-square mx-auto relative' : 'aspect-square relative'}`}>
              <PolarArea items={items} max1={100} max2={120} />
            </div>
          </div>
        </div>
      )}

      {errorMsg ? <div className="mt-3 text-sm text-[#dc2626]">{errorMsg}</div> : null}
    </div>
  );

  if (frameless) {
    return (
      <div className={`w-full ${fill ? 'h-full' : ''} ${className}`}>
        <Inner />
      </div>
    );
  }

  return (
    <div className={`h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-6 shadow-sm ${className}`}>
      <Inner />
    </div>
  );
}
