// components/home/statsbento/IntervalsCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';

// Reuse hooks & utils as PitchFocusCard
import { useMeasure, useCanvas2d } from './pitch/hooks';
import { clamp01, clamp, ease } from './pitch';

// Solid green & highlight (no blending)
const GREEN_BASE = '#5ac698';
const GREEN_HI   = '#23d794';

type Item = { label: string; pct: number; attempts: number };

const intervalName = (s: number) =>
  ({ 0:'Unison',1:'m2',2:'M2',3:'m3',4:'M3',5:'P4',6:'TT',7:'P5',8:'m6',9:'M6',10:'m7',11:'M7',12:'Octave' } as Record<number,string>)[s] ?? `${s}`;

// dataset-bounds normalization
const GAMMA = 0.9;
const TAU = Math.PI * 2;

const normFromDataset = (vals: number[]): ((v: number) => number) => {
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  const spread = vMax - vMin;
  if (!isFinite(vMin) || !isFinite(vMax) || spread <= 1e-6) {
    return () => Math.pow(0.75, GAMMA);
  }
  return (v: number) => Math.pow(clamp01((v - vMin) / spread), GAMMA);
};

// text fitting helper (clamps font by width; we also height-clamp later)
function fitFontPx(text: string, family: string, weight: string, maxWidth: number, minPx: number, maxPx: number) {
  if (typeof window === 'undefined') return Math.max(minPx, Math.min(maxPx, minPx));
  const cnv = document.createElement('canvas');
  const ctx = cnv.getContext('2d');
  if (!ctx) return Math.max(minPx, Math.min(maxPx, minPx));
  let lo = minPx, hi = maxPx, best = minPx;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ctx.font = `${weight} ${mid}px ${family}`;
    const w = ctx.measureText(text).width;
    if (w <= maxWidth) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return best;
}

// fill full annulus between r0..r1 with a color/gradient
function fillAnnulus(ctx: CanvasRenderingContext2D, r0: number, r1: number, paint: string | CanvasGradient | CanvasPattern) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r1, 0, TAU);
  ctx.arc(0, 0, r0, 0, TAU, true);
  ctx.closePath();
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.restore();
}

// stroke the inner & outer edges of an annulus
function strokeAnnulusEdges(ctx: CanvasRenderingContext2D, r0: number, r1: number, color: string, width = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(0, 0, r0, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r1, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// curved text along a circle, centered at angle 'theta' (bottom text will be upside down — intended)
function drawCurvedText(ctx: CanvasRenderingContext2D, text: string, radius: number, theta: number) {
  if (!text) return;
  let totalW = 0;
  for (let i = 0; i < text.length; i++) totalW += ctx.measureText(text[i]).width;
  if (totalW <= 0) return;

  const span = totalW / radius; // radians length along arc
  let a = theta - span / 2;     // starting angle (left edge)

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = Math.max(0.001, ctx.measureText(ch).width);
    const half = (w / 2) / radius;
    a += half; // advance to char center
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);   // tangent
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    a += half; // next
  }
}

/* ---------------- Polar Area (single green metric) ---------------- */
function PolarAreaIntervals({ items, height = 360 }: { items: Item[]; height?: number }) {
  const { ref, width } = useMeasure();
  const sqH = width > 0 ? width : height;
  const { ref: canvasRef } = useCanvas2d(width, sqH);

  const [t, setT] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const u = ease((now - start) / 800);
      setT(u);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items.length]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;

    const W = Math.max(1, width);
    const Hpx = Math.max(1, sqH);
    ctx.clearRect(0, 0, W, Hpx);

    const minSide = Math.min(W, Hpx);
    if (minSide < 64) return;

    // geometry (identical outline as pitch)
    const ringPad = 8;
    const labelOutset = Math.max(20, Math.min(30, minSide * 0.05));
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad - labelOutset);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = Hpx / 2;

    const vals = items.map(it => clamp01(it.pct / 100));
    const norm = normFromDataset(vals);

    // sectors
    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6;
    const totalGap = gapRad * n;
    const sector = Math.max(0, (Math.PI * 2 - totalGap) / n);
    const startBase = -Math.PI / 2;

    // label band (~2× thicker than original) + font sizing
    const labelFontPx = Math.round(Math.max(11, Math.min(15, minSide * 0.04)));
    const rText = Rmax + labelOutset * 0.9;
    const bandThickness = Math.max(16, labelOutset * 1.2); // thicker banner for comfy top/bottom gap
    const bandInner = rText - bandThickness / 2;
    const bandOuter = rText + bandThickness / 2;

    ctx.save();
    ctx.translate(cx, cy);

    // ---- gradient banner (outer #f6f6f6 → center #f5f5f5 → outer #f6f6f6) ----
    const bannerGrad = ctx.createRadialGradient(0, 0, bandInner, 0, 0, bandOuter);
    bannerGrad.addColorStop(0.00, '#f2f2f2');
    bannerGrad.addColorStop(0.50, '#f1f1f1');
    bannerGrad.addColorStop(1.00, '#f2f2f2');
    fillAnnulus(ctx, bandInner, bandOuter, bannerGrad);

    // ---- card-style stroke on both edges (no shadow) ----
    strokeAnnulusEdges(ctx, bandInner, bandOuter, '#d2d2d2', 1);

    // slight inward optical offset so text is perfectly centered between edges
    const textRadialOffset = -Math.max(1, Math.min(2, bandThickness * 0.08));

    for (let i = 0; i < n; i++) {
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      const mid = (a0 + a1) / 2;

      const u = norm(vals[i]);
      const rFill = r0 + (Rmax - r0) * u * t;

      // solid sector fill (green)
      const fill = hover === i ? GREEN_HI : GREEN_BASE;

      ctx.save();
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rFill), a0, a1, false);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // green rim (opaque)
      ctx.save();
      ctx.strokeStyle = fill;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rFill), a0, a1, false);
      ctx.stroke();
      ctx.restore();

      // ----- CURVED OUTSIDE LABELS (on the banner; bottom labels upside down by design) -----
      ctx.save();
      ctx.fillStyle = '#0f0f0f';
      ctx.font = `bold ${labelFontPx}px ui-sans-serif, system-ui`;
      drawCurvedText(ctx, items[i].label, rText + textRadialOffset, mid);
      ctx.restore();
    }

    ctx.restore();
  }, [canvasRef, width, sqH, items, t, hover]);

  const onMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();

    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    const minSide = Math.min(W, H);
    if (minSide < 64) { setHover(null); return; }

    const ringPad = 8;
    const labelOutset = Math.max(20, Math.min(30, minSide * 0.05));
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad - labelOutset);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = H / 2;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - cx, dy = y - cy;
    const r = Math.hypot(dx, dy);

    if (r < r0 - 6 || r > Rmax + 10) { setHover(null); return; }

    const startBase = -Math.PI / 2;
    const ang = Math.atan2(dy, dx);
    let rel = ang - startBase;
    while (rel < 0) rel += Math.PI * 2;
    while (rel >= Math.PI * 2) rel -= Math.PI * 2;

    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6;
    const sector = Math.max(0, (Math.PI * 2 - gapRad * n) / n);
    const cluster = sector + gapRad;

    const idx = Math.floor(rel / cluster);
    const posInCluster = rel - idx * cluster;
    if (idx < 0 || idx >= n || posInCluster > sector) { setHover(null); return; }

    setHover(idx);
  }, [items, canvasRef]);

  const onMouseLeave = React.useCallback(() => { setHover(null); }, []);

  // Center content (label + metrics) with clamped sizes
  const center = React.useMemo(() => {
    if (hover == null || !items[hover]) return null;
    const it = items[hover];
    const pct = clamp(Math.round(it.pct), 0, 100);
    return { label: it.label, pct };
  }, [hover, items]);

  const centerSizing = React.useMemo(() => {
    const W = Math.max(1, width);
    const H = Math.max(1, sqH);
    const minSide = Math.min(W, H);
    const ringPad = 8;
    const labelOutset = Math.max(20, Math.min(30, minSide * 0.05));
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad - labelOutset);
    const r0 = Math.max(0, R * 0.20);
    const maxWidth = Math.max(24, 2 * r0 - 16);
    const maxHeight = Math.max(18, 2 * r0 - 18);
    const family = 'ui-sans-serif, system-ui';

    if (!center) return { maxWidth, labelPx: 12, metricsPx: 10 };

    const labelMax = Math.round(Math.max(12, Math.min(18, minSide * 0.05)));
    const labelMin = 9;
    const metricsMax = Math.round(Math.max(10, Math.min(14, minSide * 0.035)));
    const metricsMin = 8;

    let labelPx = fitFontPx(center.label, family, 'bold', maxWidth, labelMin, labelMax);
    let metricsPx = fitFontPx(`${center.pct}%`, family, '500', maxWidth, metricsMin, metricsMax);

    const gap = Math.max(2, Math.round(metricsPx * 0.25));
    const block = labelPx + gap + metricsPx;
    if (block > maxHeight) {
      const k = maxHeight / block;
      labelPx = Math.max(labelMin, Math.floor(labelPx * k));
      metricsPx = Math.max(metricsMin, Math.floor(metricsPx * k));
    }

    return { maxWidth, labelPx, metricsPx };
  }, [width, sqH, center]);

  return (
    <div
      ref={ref}
      className="relative w-full bg-transparent"
      style={{ height: sqH }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Centered info (clamped) */}
      {center ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ maxWidth: centerSizing.maxWidth }}
        >
          <div
            className="font-semibold text-[#0f0f0f] leading-none truncate"
            style={{ fontSize: centerSizing.labelPx }}
            title={center.label}
          >
            {center.label}
          </div>
          <div
            className="mt-1 text-[#0f0f0f] flex items-center justify-center gap-3"
            style={{ fontSize: centerSizing.metricsPx, fontWeight: 500 }}
          >
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: GREEN_BASE }} />
              {center.pct}%
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Card + data ---------------- */
export default function IntervalsCard({
  frameless = false,
  fill = false,
  className = '',
}: {
  frameless?: boolean;
  fill?: boolean;
  className?: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const { recentIds, loading: baseLoading, error: baseErr } = useHomeResults();

  const [items, setItems] = React.useState<Item[]>([]);
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

        const iQ = await supabase
          .from('lesson_result_interval_classes')
          .select('result_id, semitones, attempts, correct')
          .in('result_id', recentIds);

        if (iQ.error) throw iQ.error;

        type IntervalRow = { result_id: number; semitones: number; attempts: number; correct: number };
        const rows: IntervalRow[] = (iQ.data ?? []) as IntervalRow[];

        const by = new Map<number, { a: number; c: number }>(); for (let i = 0; i <= 12; i++) by.set(i,{a:0,c:0});
        for (const r of rows) {
          const g = by.get(r.semitones)!;
          g.a += Number(r.attempts || 0);
          g.c += Number(r.correct || 0);
        }

        const anchors = new Set([0, 2, 3, 7, 12]);
        const list = Array.from({ length: 13 }, (_, s) => {
          const v = by.get(s)!;
          const pct = v.a ? Math.round((100 * v.c) / v.a) : 0;
          return { s, label: intervalName(s), pct, attempts: v.a };
        })
          .filter(x => x.pct > 0 || anchors.has(x.s))
          .map(({ label, pct, attempts }) => ({ label, pct, attempts }));

        if (!cancelled) setItems(list);
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

  const Inner = () => (
    <div className={fill ? 'h-full flex flex-col' : undefined}>
      {isLoading ? (
        <div className="mt-2 w-full h-full min-h-[240px] animate-pulse rounded-xl bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee]" />
      ) : items.length === 0 ? (
        <div className="mt-2 w-full h-full min-h-[240px] flex items-center justify-center text-base text-[#0f0f0f] rounded-xl bg-[#f5f5f5]">
          No interval attempts yet.
        </div>
      ) : (
        <div className={`mt-2 ${fill ? 'flex-1 min-h-0' : ''}`}>
          <div className={`${fill ? 'h-full' : ''} w-full`}>
            <div className={`${fill ? 'h-full aspect-square mx-auto relative' : 'aspect-square relative'}`}>
              <PolarAreaIntervals items={items} />
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
