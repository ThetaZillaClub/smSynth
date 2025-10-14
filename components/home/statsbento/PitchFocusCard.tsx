// components/home/statsbento/PitchFocusCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';

import { PolarArea, NOTE, clamp } from './pitch'; // ← compose from the subfolder

type PitchNoteRow = {
  result_id: number;
  midi: number;
  n: number | null;
  ratio: number | null;
  cents_mae: number | null;
};

export default function PitchFocusCard({
  frameless = false,
  className = '',
}: {
  frameless?: boolean;
  className?: string;
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

        const rows: PitchNoteRow[] = (pQ.data ?? []) as PitchNoteRow[];

        const byMidi = new Map<number, { w: number; on: number; mae: number }>();
        for (const p of rows) {
          const w = Math.max(1, Number(p.n ?? 1));
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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, recentIds, baseLoading, baseErr]);

  const isLoading = baseLoading || loading;
  const errorMsg = baseErr || err;

  // Colors to match the rest of the UI
  const BLUE = '#3b82f6';
  const GREEN = PR_COLORS.noteFill;

  const LegendPill = ({ dot, label, border }: { dot: string; label: string; border: string }) => (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-white text-[#0f0f0f] shadow-sm ring-1 ring-[#3b82f6] border"
      style={{ borderColor: border }}
    >
      <span className="mr-1.5 inline-block w-2.5 h-2.5 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );

  const Inner = () => (
    <>
      {/* No big heading — tabs already provide the context. Keep only the legend, right-aligned. */}
      <div className="flex items-center justify-end gap-2 sm:gap-3">
        <LegendPill dot={GREEN} label="On-pitch %" border={GREEN} />
        <LegendPill dot={BLUE}  label="MAE ¢"     border={BLUE} />
      </div>

      {isLoading ? (
        <div className="mt-2 w-full aspect-square animate-pulse rounded-xl bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee]" />
      ) : items.length === 0 ? (
        <div className="mt-2 w-full aspect-square flex items-center justify-center text-base text-[#0f0f0f] rounded-xl bg-[#f5f5f5]">
          No per-note data yet.
        </div>
      ) : (
        <div className="mt-2 relative w-full aspect-square">
          <PolarArea items={items} max1={100} max2={120} />
        </div>
      )}

      {errorMsg ? <div className="mt-3 text-sm text-[#dc2626]">{errorMsg}</div> : null}
    </>
  );

  if (frameless) {
    return (
      <div className={`w-full ${className}`}>
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
