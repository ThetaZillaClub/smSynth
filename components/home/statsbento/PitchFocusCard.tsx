// components/home/statsbento/PitchFocusCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { midiToNoteName } from '@/utils/pitch/pitchMath';
import { PR_COLORS } from '@/utils/stage';

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const noteText = (m: number) => { const n = midiToNoteName(m, { useSharps: true }); return `${n.name}${n.octave}`; };

function useMeasure() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 0));
    ro.observe(el); setW(el.clientWidth || 0);
    return () => ro.disconnect();
  }, []);
  return { ref, width: w };
}
function useDpr() {
  const [dpr, setDpr] = React.useState(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  React.useEffect(() => {
    const h = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('resize', h); };
  }, []);
  return dpr;
}
function useCanvas2d(width: number, height: number) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const dpr = useDpr();
  React.useLayoutEffect(() => {
    const c = ref.current; if (!c) return;
    const W = Math.max(1, Math.floor(width)); const H = Math.max(1, Math.floor(height));
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height, dpr]);
  return { ref, dpr };
}

function VerticalSticks({
  items, max1 = 100, max2 = 120, height = 320, stickW = 12, gap = 18,
}: {
  items: { label: string; v1: number; v2?: number }[];
  max1?: number; max2?: number; height?: number; stickW?: number; gap?: number;
}) {
  const { ref, width } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, height);
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 700); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);
  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return;
    const W = width, H = height;
    ctx.clearRect(0, 0, W, H);

    // tighter bottom padding; both left and right y-axis labels
    const pad = { l: 56, r: 56, t: 12, b: 28 };
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
    const baseline = pad.t + ih;

    // grid + Y labels (% on left, MAE ¢ on right)
    const ticks = 4;
    ctx.font = '13px ui-sans-serif, system-ui';
    ctx.fillStyle = '#0f0f0f';
    for (let i = 0; i <= ticks; i++) {
      const y = Math.round(pad.t + (ih * i) / ticks) + 0.5;
      const major = i % 2 === 0;
      ctx.strokeStyle = major ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = major ? 1.25 : 0.75;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();

      // left: percent
      const pVal = Math.round((max1 * (ticks - i)) / ticks);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${pVal}%`, pad.l - 8, y);

      // right: MAE (¢)
      const mVal = Math.round((max2 * (ticks - i)) / ticks);
      ctx.textAlign = 'left';
      ctx.fillText(`${mVal}¢`, pad.l + iw + 8, y);
    }

    const dual = items.some(it => typeof it.v2 === 'number');
    const clusterW = dual ? (stickW * 2 + 8) : stickW;
    const totalW = items.length * clusterW + Math.max(0, items.length - 1) * gap;
    const x0 = pad.l + Math.max(0, (iw - totalW) / 2);

    const labelStep = Math.max(1, Math.ceil(items.length / 8));
    ctx.fillStyle = '#0f0f0f'; ctx.font = '13px ui-sans-serif, system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';

    const TEAL = '#14b8a6';

    items.forEach((it, i) => {
      const cx = x0 + i * (clusterW + gap);

      // v1 (on-pitch %)
      const h1 = ih * clamp((it.v1 / max1) * t);
      const x1 = cx; const y1 = baseline - h1;
      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.fillRect(x1, y1, stickW, h1);
      ctx.strokeStyle = PR_COLORS.noteStroke; ctx.lineWidth = 1;
      ctx.strokeRect(x1 + 0.5, y1 + 0.5, stickW, h1);

      // v2 (MAE cents)
      if (dual && typeof it.v2 === 'number') {
        const h2 = ih * clamp((it.v2 / (max2 ?? 120)) * t);
        const x2 = cx + stickW + 8; const y2 = baseline - h2;
        ctx.fillStyle = TEAL;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x2, y2, stickW, h2);
        ctx.globalAlpha = 1;
      }

      if (i % labelStep === 0) {
        const center = dual ? (x1 + stickW + 4 + stickW / 2) : (x1 + stickW / 2);
        ctx.fillStyle = '#0f0f0f';
        ctx.fillText(it.label, center, baseline + 8);
      }
    });
  }, [canvasRef, width, height, items, max1, max2, stickW, gap, t]);

  return <div ref={ref} className="relative w-full" style={{ height }}>
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }} />
  </div>;
}

export default function PitchFocusCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<{ label: string; v1: number; v2: number }[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id; if (!uid) throw new Error('No user');

        const { data: results, error: rErr } = await supabase
          .from('lesson_results')
          .select('id, created_at')
          .eq('uid', uid)
          .order('created_at', { ascending: true })
          .limit(60);
        if (rErr) throw rErr;
        const recentIds = (results ?? []).slice(-30).map((r: any) => r.id);

        if (!recentIds.length) { if (!cancelled) setItems([]); return; }

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
          g.w   = wt; byMidi.set(p.midi, g);
        }
        const fragile = Array.from(byMidi.entries())
          .map(([m, v]) => ({ name: noteText(m), on: Math.round(v.on * 100), mae: Math.round(v.mae), score: (1 - clamp(v.on)) * 0.6 + Math.min(1, v.mae / 120) * 0.4 }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map(({ name, on, mae }) => ({ label: name, v1: on, v2: mae }));

        if (!cancelled) setItems(fragile);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <div className="rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-white to-[#f7f7f7] p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Pitch Focus</h3>
        <div className="text-sm text-[#0f0f0f] flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: PR_COLORS.noteFill }} />
            On-pitch %
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#14b8a6' }} />
            MAE (¢)
          </span>
        </div>
      </div>
      {loading ? (
        <div className="h-[75%] mt-3 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : items.length === 0 ? (
        <div className="h-[75%] mt-3 flex items-center justify-center text-base text-[#0f0f0f]">No per-note data yet.</div>
      ) : (
        <VerticalSticks items={items} max1={100} max2={120} height={320} stickW={12} gap={18} />
      )}
      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
