// components/home/statsbento/PitchFocusCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { midiToNoteName } from '@/utils/pitch/pitchMath';
import { PR_COLORS } from '@/utils/stage';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const NOTE = (m: number) => {
  const n = midiToNoteName(m, { useSharps: true });
  return `${n.name}${n.octave}`;
};

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

type Item = { label: string; v1: number; v2: number };
type Hit = { x1: number; x2: number; cx: number; v1Top: number; v2Top: number; v1H: number; v2H: number };

function VerticalSticks({
  items,
  max1 = 100,          // on-pitch %
  max2 = 120,          // MAE (¢)
  height = 360,
  stickW = 14,
  gap = 20,
}: {
  items: Item[];
  max1?: number; max2?: number; height?: number; stickW?: number; gap?: number;
}) {
  const { ref, width } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, height);

  const [t, setT] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const hitsRef = React.useRef<Hit[]>([]);
  const hostRef = ref;

  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 650); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [items.length]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = width, H = height;
    ctx.clearRect(0, 0, W, H); // transparent canvas

    // Outer padding & gutters so Y labels have room
    const pad = { l: 66, r: 66, t: 10, b: 22 };
    const innerGutter = 16;              // between Y-labels and plot edge
    const labelGap = 16;                 // label text offset from plot edge
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
    const baseline = pad.t + ih;

    // Plot rect
    const plotL = pad.l + innerGutter;
    const plotR = pad.l + iw - innerGutter;
    const plotW = Math.max(10, plotR - plotL);

    // --- GRID + Y AXES ---
    const ticks = 4;
    ctx.save();
    ctx.font = '14px ui-sans-serif, system-ui';
    for (let i = 0; i <= ticks; i++) {
      const y = Math.round(pad.t + (ih * i) / ticks) + 0.5;
      const major = i % 2 === 0;
      ctx.strokeStyle = major ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = major ? 1.25 : 0.75;
      ctx.beginPath(); ctx.moveTo(plotL, y); ctx.lineTo(plotR, y); ctx.stroke();

      // Left (% descending)
      ctx.fillStyle = '#0f0f0f';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const pVal = Math.round((max1 * (ticks - i)) / ticks);
      ctx.fillText(`${pVal}%`, plotL - labelGap, y);

      // Right (MAE ascending)
      ctx.textAlign = 'left';
      const mVal = Math.round((max2 * i) / ticks);
      ctx.fillText(`${mVal}¢`, plotR + labelGap, y);
    }
    ctx.restore();

    // --- FIT LAYOUT: dynamically scale widths/gaps to fit plotW ---
    const n = items.length;
    const BASE_INNER = 10; // space between the two bars in a cluster

    // minimums to remain readable on small widths
    const MIN_STICK = 4;
    const MIN_GAP = 4;
    const MIN_INNER = 4;

    // first pass: proportional scale
    const baseCluster = stickW * 2 + BASE_INNER;
    const baseTotal = n * baseCluster + Math.max(0, n - 1) * gap;

    // compute scaled sizes
    let scale = baseTotal > plotW ? plotW / baseTotal : 1;
    let sW = Math.max(MIN_STICK, Math.floor(stickW * scale));
    let inner = Math.max(MIN_INNER, Math.floor(BASE_INNER * scale));
    let g = Math.max(MIN_GAP, Math.floor(gap * scale));

    // second pass: ensure guaranteed fit (reallocate width if mins forced overflow)
    let total = n * (2 * sW + inner) + Math.max(0, n - 1) * g;
    if (total > plotW) {
      // Reduce gaps first down to MIN_GAP
      const targetForBars = plotW - Math.max(0, n - 1) * MIN_GAP;
      g = MIN_GAP;

      // Distribute remaining width to bars + inner
      let clusterAvail = Math.floor(targetForBars / n); // width per cluster
      // Keep inner proportional but not below MIN_INNER
      const innerShare = Math.max(MIN_INNER, Math.floor(clusterAvail * (BASE_INNER / baseCluster)));
      const barsAvail = Math.max(2 * MIN_STICK, clusterAvail - innerShare);
      sW = Math.max(MIN_STICK, Math.floor(barsAvail / 2));
      inner = Math.max(MIN_INNER, clusterAvail - 2 * sW);

      total = n * (2 * sW + inner) + Math.max(0, n - 1) * g;
      // If somehow still > plotW due to rounding, shave a pixel off sW until it fits
      while (total > plotW && sW > MIN_STICK) {
        sW -= 1;
        total = n * (2 * sW + inner) + Math.max(0, n - 1) * g;
      }
    }

    // x origin centered
    const x0 = plotL + Math.max(0, Math.floor((plotW - total) / 2));

    // --- DRAW BARS (hard-clipped to plot rect) ---
    const TEAL = '#14b8a6';
    hitsRef.current = [];

    ctx.save();
    ctx.beginPath();
    ctx.rect(plotL + 0.5, pad.t + 0.5, plotW - 1, ih - 1);
    ctx.clip();

    const pct = (v: number) => clamp(v, 0, max1) / max1;
    const invMae = (val: number) => {
      const v = clamp(val, 0, max2);
      return (max2 - v) / max2; // taller = lower MAE
    };

    for (let i = 0; i < n; i++) {
      const it = items[i];
      const cx = x0 + i * (2 * sW + inner + g);

      // height calculations with clamped values
      const h1 = ih * clamp01(pct(it.v1)) * t;
      const h2 = ih * clamp01(invMae(it.v2)) * t;

      const x1 = cx;
      const x2 = cx + sW + inner;
      const y1 = baseline - h1;
      const y2 = baseline - h2;

      // hover band
      if (hover === i) {
        ctx.save();
        ctx.fillStyle = 'rgba(16,24,40,0.06)';
        const bandPad = 6;
        ctx.fillRect(x1 - bandPad, pad.t + 2, (2 * sW + inner) + bandPad * 2, ih - 2);
        ctx.restore();
      }

      // bars
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = PR_COLORS.noteFill; // on-pitch %
      ctx.fillRect(Math.round(x1), Math.round(y1), sW, Math.max(0, Math.round(h1)));

      ctx.fillStyle = TEAL;               // MAE inverted
      ctx.fillRect(Math.round(x2), Math.round(y2), sW, Math.max(0, Math.round(h2)));

      ctx.restore();

      // strokes (crisp)
      ctx.lineWidth = 1;
      ctx.strokeStyle = PR_COLORS.noteStroke;
      ctx.strokeRect(x1 + 0.5, y1 + 0.5, sW - 1, Math.max(0, Math.round(h1) - 1));
      ctx.strokeStyle = 'rgba(20,184,166,0.65)';
      ctx.strokeRect(x2 + 0.5, y2 + 0.5, sW - 1, Math.max(0, Math.round(h2) - 1));

      // hover values
      if (hover === i) {
        ctx.save();
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#0f0f0f';
        const dv1 = clamp(Math.round(it.v1), 0, max1);
        const dv2 = clamp(Math.round(it.v2), 0, max2);
        ctx.fillText(`${dv1}%`, x1 + sW / 2, y1 - 6);
        ctx.fillText(`${dv2}¢`, x2 + sW / 2, y2 - 6);
        ctx.restore();

        // connectors
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1 + sW / 2, y1 - 4); ctx.lineTo(x1 + sW / 2, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2 + sW / 2, y2 - 4); ctx.lineTo(x2 + sW / 2, y2); ctx.stroke();
        ctx.restore();
      }

      // hit zones (not clipped)
      hitsRef.current.push({
        x1, x2: x2 + sW, cx: x1 + sW + inner / 2,
        v1Top: y1, v2Top: y2, v1H: h1, v2H: h2,
      });
    }

    // focus ring (inside plot)
    if (hover != null && hitsRef.current[hover]) {
      const h = hitsRef.current[hover];
      const left = h.x1 - 6, right = h.x2 + 6;
      ctx.save();
      ctx.strokeStyle = 'rgba(16,24,40,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(left + 0.5, pad.t + 1.5, Math.max(0, right - left), ih - 3);
      ctx.restore();
    }

    ctx.restore(); // end plot clipping

    // --- X LABELS (clamped to plot rect) ---
    const labelStep = Math.max(1, Math.ceil(n / 8));
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotL, pad.t, plotW, ih + 28);
    ctx.clip();
    ctx.fillStyle = '#0f0f0f'; ctx.font = '14px ui-sans-serif, system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';

    for (let i = 0; i < n; i++) {
      if (i % labelStep !== 0) continue;
      const cx = x0 + i * (2 * sW + inner + g);
      const centerIdeal = cx + sW + inner / 2;
      const center = clamp(centerIdeal, plotL + 8, plotR - 8);
      ctx.fillText(items[i].label, center, baseline + 6);
    }
    ctx.restore();
  }, [canvasRef, width, height, items, max1, max2, stickW, gap, t, hover]);

  // hover/tooltip plumbing
  const [tip, setTip] = React.useState<{ x: number; y: number; label: string; v1: number; v2: number } | null>(null);
  const onMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let idx: number | null = null;
    for (let i = 0; i < hitsRef.current.length; i++) {
      const h = hitsRef.current[i];
      if (x >= h.x1 - 8 && x <= h.x2 + 8) { idx = i; break; }
    }
    setHover(idx);
    if (idx != null) {
      const it = items[idx];
      const h = hitsRef.current[idx];
      const tipX = clamp(h.cx, 8, rect.width - 8);
      const tipY = Math.min(h.v1Top, h.v2Top) - 14;
      setTip({
        x: tipX,
        y: Math.max(12, tipY),
        label: it.label,
        v1: clamp(Math.round(it.v1), 0, max1),
        v2: clamp(Math.round(it.v2), 0, max2)
      });
    } else {
      setTip(null);
    }
  }, [items, max1, max2]);
  const onMouseLeave = React.useCallback(() => { setHover(null); setTip(null); }, []);

  return (
    <div
      ref={hostRef}
      className="relative w-full"
      style={{ height }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }}
      />
      {tip ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium shadow-md"
          style={{
            left: tip.x,
            top: tip.y,
            borderColor: '#e5e7eb',
            color: '#0f0f0f',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold">{tip.label}</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PR_COLORS.noteFill }} />
              {tip.v1}%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#14b8a6' }} />
              {tip.v2}¢
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PitchFocusCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<Array<{ label: string; v1: number; v2: number }>>([]);

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

        // Build full list with midi so we can sort by MIDI later
        const full = Array.from(byMidi.entries()).map(([m, v]) => ({
          midi: m,
          label: NOTE(m),
          v1: Math.round(v.on * 100),     // on-pitch %
          v2: Math.round(v.mae),          // MAE ¢
          score: (1 - clamp(v.on, 0, 1)) * 0.6 + Math.min(1, v.mae / 120) * 0.4,
        }));

        // Take the 8 most fragile, THEN sort them in standard MIDI order
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
            MAE ¢
          </span>
        </div>
      </div>

      {loading ? (
        <div className="h-[78%] mt-2 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : items.length === 0 ? (
        <div className="h-[78%] mt-2 flex items-center justify-center text-base text-[#0f0f0f]">
          No per-note data yet.
        </div>
      ) : (
        <VerticalSticks
          items={items}
          max1={100}
          max2={120}
          height={360}
          stickW={14}
          gap={20}
        />
      )}

      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
