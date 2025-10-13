// components/home/statsbento/PitchFocusCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { midiToNoteName } from '@/utils/pitch/pitchMath';
import { PR_COLORS } from '@/utils/stage';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const NOTE = (m: number) => {
  const n = midiToNoteName(m, { useSharps: true });
  return `${n.name}${n.octave}`;
};

/* ---------------- measure & canvas hooks ---------------- */
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

/* ---------------- polar area chart ---------------- */
type Item = { label: string; v1: number; v2: number }; // v1 = on-pitch %, v2 = MAE ¢

const GAMMA = 0.9;
const normFromDataset = (vals: number[]): ((v: number) => number) => {
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  const spread = vMax - vMin;
  if (!isFinite(vMin) || !isFinite(vMax) || spread <= 1e-6) {
    return () => Math.pow(0.75, GAMMA);
  }
  return (v: number) => Math.pow(clamp01((v - vMin) / spread), GAMMA);
};

function PolarArea({
  items,
  max1 = 100,      // on-pitch %
  max2 = 120,      // MAE ¢
  height = 360,
}: {
  items: Item[];
  max1?: number;
  max2?: number;
  height?: number;
}) {
  const { ref, width } = useMeasure();
  // square size: use measured width; fallback to provided height on first pass
  const sqH = (width > 0 ? width : height);
  const { ref: canvasRef } = useCanvas2d(width, sqH);

  const [t, setT] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const [tip, setTip] = React.useState<{ x: number; y: number; label: string; v1: number; v2: number } | null>(null);

  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 800); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [items.length]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;

    const W = Math.max(1, width);
    const Hpx = Math.max(1, sqH); // use measured square height
    ctx.clearRect(0, 0, W, Hpx);

    const minSide = Math.min(W, Hpx);
    if (minSide < 64) return;

    const ringPad = 8;
    // Fill (almost) the whole square
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = Hpx / 2;

    const onVals  = items.map(it => clamp01(it.v1 / max1));
    const maeGood = items.map(it => clamp01(1 - it.v2 / max2));
    const normOn  = normFromDataset(onVals);
    const normMae = normFromDataset(maeGood);

    // background rings (thicker)
    ctx.save();
    ctx.translate(cx, cy);
    const rings = 4;
    for (let i = 1; i <= rings; i++) {
      const r = Math.max(1, r0 + (Rmax - r0) * (i / rings));
      ctx.strokeStyle = i % 2 === 0 ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = i % 2 === 0 ? 3 : 2;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // sectors
    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6;
    const totalGap = gapRad * n;
    const sector = Math.max(0, (Math.PI * 2 - totalGap) / n);
    const startBase = -Math.PI / 2;

    // responsive label sizing/padding (bigger + more inset) + bold
    const labelPad = Math.max(20, Math.min(30, minSide * 0.05));
    const labelFont = Math.round(Math.max(14, Math.min(16, minSide * 0.045)));

    ctx.save();
    ctx.translate(cx, cy);

    for (let i = 0; i < n; i++) {
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      const mid = (a0 + a1) / 2;

      const uOn  = normOn(onVals[i]);
      const uMae = normMae(maeGood[i]);

      const rMae = r0 + (Rmax - r0) * uMae * t;
      const rOn  = r0 + (Rmax - r0) * uOn  * t;

      if (hover === i) {
        ctx.save();
        ctx.fillStyle = 'rgba(16,24,40,0.06)';
        ctx.beginPath();
        ctx.arc(0, 0, Rmax + 4, a0, a1, false);
        ctx.arc(0, 0, Math.max(0, r0 - 4), a1, a0, true);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // MAE layer
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#14b8a6';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rMae), a0, a1, false);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // On-pitch layer
      ctx.save();
      ctx.globalAlpha = 0.60;
      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rOn), a0, a1, false);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // rim (thicker)
      ctx.save();
      ctx.strokeStyle = PR_COLORS.noteStroke;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rOn), a0, a1, false);
      ctx.stroke();
      ctx.restore();

      // label (inside the circle, bold)
      const lblR = Rmax - labelPad;
      ctx.save();
      ctx.fillStyle = '#0f0f0f';
      ctx.font = `bold ${labelFont}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(items[i].label, Math.cos(mid) * lblR, Math.sin(mid) * lblR);
      ctx.restore();
    }

    // focus ring (thicker)
    if (hover != null) {
      const i = hover;
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      ctx.save();
      ctx.strokeStyle = 'rgba(16,24,40,0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Rmax + 5, a0, a1, false);
      ctx.arc(0, 0, Math.max(0, r0 - 5), a1, a0, true);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [canvasRef, width, sqH, items, max1, max2, t, hover]);

  // hit detection + tooltip
  const onMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();

    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    const minSide = Math.min(W, H);
    if (minSide < 64) { setHover(null); setTip(null); return; }

    const ringPad = 8;
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = H / 2;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - cx, dy = y - cy;
    const r = Math.hypot(dx, dy);

    if (r < r0 - 6 || r > Rmax + 10) { setHover(null); setTip(null); return; }

    const startBase = -Math.PI / 2;
    let ang = Math.atan2(dy, dx);
    let rel = ang - startBase;
    while (rel < 0) rel += Math.PI * 2;
    while (rel >= Math.PI * 2) rel -= Math.PI * 2;

    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6;
    const sector = Math.max(0, (Math.PI * 2 - gapRad * n) / n);
    const cluster = sector + gapRad;

    const idx = Math.floor(rel / cluster);
    const posInCluster = rel - idx * cluster;
    if (idx < 0 || idx >= n || posInCluster > sector) { setHover(null); setTip(null); return; }

    setHover(idx);

    // place tooltip using dataset-normalized on-pitch radius
    const onVals  = items.map(it => clamp01(it.v1 / max1));
    const normOn  = normFromDataset(onVals);
    const it = items[idx];
    const uOn = normOn(onVals[idx]);
    const Rdraw = r0 + (Rmax - r0) * uOn;

    const mid = (startBase + idx * cluster) + sector / 2;
    const tipX = clamp(cx + Math.cos(mid) * (Rdraw + 12), 8, W - 8);
    const tipY = clamp(cy + Math.sin(mid) * (Rdraw + 12), 8, H - 8);

    setTip({
      x: tipX,
      y: tipY,
      label: it.label,
      v1: clamp(Math.round(it.v1), 0, max1),
      v2: clamp(Math.round(it.v2), 0, max2),
    });
  }, [items, max1, max2, canvasRef]);

  const onMouseLeave = React.useCallback(() => { setHover(null); setTip(null); }, []);

  return (
    <div
      ref={ref}
      className="relative w-full bg-transparent"
      style={{ height: sqH }} // keep the chart area square
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}
      />
      {tip ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium shadow-md"
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
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: PR_COLORS.noteFill }} />
              {tip.v1}%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#14b8a6' }} />
              {tip.v2}¢
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- card ---------------- */
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
    <div className="rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f7f7f7] to-[#f4f4f4] p-6 shadow-sm">
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

      {isLoading ? (
        <div className="h-[78%] mt-2 animate-pulse rounded-xl bg-[#e8e8e8]" />
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
