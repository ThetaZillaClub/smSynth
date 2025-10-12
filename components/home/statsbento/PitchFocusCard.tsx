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

// Dataset-bounds normalization (min→0, max→1), with gentle gamma to
// keep weak values visible without biasing everything near the outer rim.
const GAMMA = 0.9;
const normFromDataset = (vals: number[]): ((v: number) => number) => {
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  const spread = vMax - vMin;
  if (!isFinite(vMin) || !isFinite(vMax) || spread <= 1e-6) {
    // all equal — give a consistent mid/high fill so the chart isn't invisible
    return () => Math.pow(0.75, GAMMA);
  }
  return (v: number) => Math.pow(clamp01((v - vMin) / spread), GAMMA);
};

function PolarArea({
  items,
  max1 = 100,      // on-pitch %
  max2 = 120,      // MAE ¢ (higher is worse; drawn inversely)
  height = 360,
}: {
  items: Item[];
  max1?: number;
  max2?: number;
  height?: number;
}) {
  const { ref, width } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, height);

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
    const H = Math.max(1, height);
    ctx.clearRect(0, 0, W, H);

    // Guard against the first tiny layout pass
    const minSide = Math.min(W, H);
    if (minSide < 64) return;

    // Radii (safe clamps)
    const ringPad = 8;
    const Rraw = minSide * 0.42;
    const R = Math.max(ringPad + 12, Rraw);        // outer usable radius
    const r0 = Math.max(0, R * 0.20);               // inner radius (donut)
    const Rmax = Math.max(r0 + 6, R - ringPad);     // ensure outer ≥ inner + margin

    const cx = W / 2, cy = H / 2;

    // Build dataset-normalizers (to OUTER BOUNDS)
    const onVals  = items.map(it => clamp01(it.v1 / max1));           // 0..1 (higher is better)
    const maeGood = items.map(it => clamp01(1 - it.v2 / max2));       // 0..1 (lower MAE → higher "goodness")
    const normOn  = normFromDataset(onVals);
    const normMae = normFromDataset(maeGood);

    // background rings (grid)
    ctx.save();
    ctx.translate(cx, cy);
    const rings = 4;
    for (let i = 1; i <= rings; i++) {
      const r = Math.max(1, r0 + (Rmax - r0) * (i / rings));
      ctx.strokeStyle = i % 2 === 0 ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = i % 2 === 0 ? 1.25 : 0.75;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // chart angles
    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6; // gap between sectors
    const totalGap = gapRad * n;
    const sector = Math.max(0, (Math.PI * 2 - totalGap) / n);
    const startBase = -Math.PI / 2; // start at top

    ctx.save();
    ctx.translate(cx, cy);

    for (let i = 0; i < n; i++) {
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      const mid = (a0 + a1) / 2;

      const it = items[i];
      const uOn  = normOn(onVals[i]);         // dataset-normalized on-pitch
      const uMae = normMae(maeGood[i]);       // dataset-normalized inverted MAE

      const rMae = r0 + (Rmax - r0) * uMae * t;    // MAE radius (base layer)
      const rOn  = r0 + (Rmax - r0) * uOn  * t;    // On-pitch radius (over layer)

      // hover highlight underlay
      if (hover === i) {
        ctx.save();
        ctx.fillStyle = 'rgba(16,24,40,0.06)';
        ctx.beginPath();
        ctx.arc(0, 0, Rmax + 4, a0, a1, false);
        ctx.arc(0, 0, Math.max(0, r0 - 4), a1, a0, true);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // --- LAYER 1: MAE FILLED SECTOR (teal, translucent) ---
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#14b8a6'; // teal
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rMae), a0, a1, false);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // --- LAYER 2: ON-PITCH FILLED SECTOR (note color, over MAE) ---
      ctx.save();
      ctx.globalAlpha = 0.60;
      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rOn), a0, a1, false);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Optional subtle rim for On-Pitch edge (kept crisp, not dashed)
      ctx.save();
      ctx.strokeStyle = PR_COLORS.noteStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rOn), a0, a1, false);
      ctx.stroke();
      ctx.restore();

      // labels (outside)
      const lblR = Rmax + 16;
      ctx.save();
      ctx.fillStyle = '#0f0f0f';
      ctx.font = '14px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label, Math.cos(mid) * lblR, Math.sin(mid) * lblR);
      ctx.restore();
    }

    // focus ring around hovered sector
    if (hover != null) {
      const i = hover;
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      ctx.save();
      ctx.strokeStyle = 'rgba(16,24,40,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, Rmax + 5, a0, a1, false);
      ctx.arc(0, 0, Math.max(0, r0 - 5), a1, a0, true);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [canvasRef, width, height, items, max1, max2, t, hover]);

  // hit detection + tooltip
  const onMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();

    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    const minSide = Math.min(W, H);
    if (minSide < 64) { setHover(null); setTip(null); return; }

    const ringPad = 8;
    const R = Math.max(ringPad + 12, minSide * 0.42);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = H / 2;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - cx, dy = y - cy;
    const r = Math.hypot(dx, dy);

    if (r < r0 - 6 || r > Rmax + 10) { setHover(null); setTip(null); return; }

    // sector math
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

    // Dataset-normalized On-Pitch for tooltip placement
    const onVals  = items.map(it => clamp01(it.v1 / max1));
    const maeGood = items.map(it => clamp01(1 - it.v2 / max2));
    const normOn  = normFromDataset(onVals);
    // const normMae = normFromDataset(maeGood); // not needed for tip position

    const it = items[idx];
    const uOn = normOn(onVals[idx]);
    const Rdraw = r0 + (Rmax - r0) * uOn * (/* same easing phase */ 1);

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

        const full = Array.from(byMidi.entries()).map(([m, v]) => ({
          midi: m,
          label: NOTE(m),
          v1: Math.round(v.on * 100),     // on-pitch %
          v2: Math.round(v.mae),          // MAE ¢
          score: (1 - clamp(v.on, 0, 1)) * 0.6 + Math.min(1, v.mae / 120) * 0.4,
        }));

        // Top 8 by "fragile" score, then order by MIDI
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
        <PolarArea items={items} max1={100} max2={120} height={360} />
      )}

      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
