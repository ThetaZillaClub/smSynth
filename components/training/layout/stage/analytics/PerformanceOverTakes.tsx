// components/training/layout/stage/analytics/PerformanceOverTakes.tsx
'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import type { TakeScore } from '@/utils/scoring/score';
import { ANA_COLORS } from './colors'; // match MultiSeriesLines grid styling

/* ─────────── small utils ─────────── */
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

function useMeasure() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth || 0, h: el.clientHeight || 0 }));
    ro.observe(el);
    setBox({ w: el.clientWidth || 0, h: el.clientHeight || 0 });
    return () => ro.disconnect();
  }, []);
  return { ref, width: box.w, height: box.h };
}
function useDpr() {
  const [dpr, setDpr] = React.useState(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  React.useEffect(() => {
    const h = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return dpr;
}
function useCanvas2d(width: number, height: number) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const dpr = useDpr();
  React.useLayoutEffect(() => {
    const c = ref.current; if (!c) return;
    const W = Math.max(1, Math.floor(width));
    const H = Math.max(1, Math.floor(height));
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height, dpr]);
  return { ref, dpr };
}

// Monotone cubic with Hyman filter (no overshoot)
function computeMonotoneSlopes(xs: number[], ys: number[]) {
  const n = xs.length;
  const ms = new Array<number>(n).fill(0);
  if (n < 2) return ms;

  const dx: number[] = new Array(n - 1);
  const s: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; ++i) {
    dx[i] = xs[i + 1] - xs[i] || 1;
    s[i] = (ys[i + 1] - ys[i]) / dx[i];
  }

  ms[0] = s[0];
  for (let i = 1; i < n - 1; ++i) {
    ms[i] = (s[i - 1] * s[i] <= 0) ? 0 : (s[i - 1] + s[i]) / 2;
  }
  ms[n - 1] = s[n - 2];

  for (let i = 0; i < n - 1; ++i) {
    if (s[i] === 0) { ms[i] = 0; ms[i + 1] = 0; continue; }
    const a = ms[i] / s[i];
    const b = ms[i + 1] / s[i];
    const r = a * a + b * b;
    if (r > 9) {
      const t = 3 / Math.sqrt(r);
      ms[i] = t * a * s[i];
      ms[i + 1] = t * b * s[i];
    }
  }
  return ms;
}

/* ─────────── types/consts ─────────── */
type Components = {
  pitch?: number;    // %
  melody?: number;   // %
  line?: number;     // %
  intervals?: number;// %
};
type Row = { take: number; final: number; comps: Components };
type PointHit = { x1: number; x2: number; cx: number; y: number; row: Row };

const SEG_COLOR: Record<keyof Components, string> = {
  pitch:     '#86efac', // green-300
  melody:    '#bbf7d0', // green-200
  line:      '#4ade80', // green-400
  intervals: '#22c55e', // green-500
};

const LINE_WIDTH = 2.5;               // match MultiSeriesLines
const LINE_COLOR = '#22c55e';
const DOT_R = 3.5;                    // match MultiSeriesLines
const DOT_STROKE = '#22c55e';
const DOT_FILL = 'rgba(34,197,94,0.18)';

function TooltipPortal({
  left, top, children,
}: { left: number; top: number; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  if (typeof document === 'undefined') return null;
  const margin = 8;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const clampedLeft = Math.min(Math.max(left, margin + w / 2), vw - margin - w / 2);
  const y = Math.max(8, top);
  return createPortal(
    <div
      ref={ref}
      className="pointer-events-none fixed -translate-x-1/2 -translate-y-full rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium shadow-md"
      style={{ left: clampedLeft, top: y, borderColor: '#e5e7eb', color: '#0f0f0f', whiteSpace: 'nowrap', zIndex: 60 }}
    >
      {children}
    </div>,
    document.body
  );
}

function LineChart({
  rows,
  height,
  gap = 10,
}: {
  rows: Row[];
  height: number | string;
  gap?: number;
}) {
  const { ref, width, height: hostH } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, typeof hostH === 'number' ? hostH : 0);

  // intro animation
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 800); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [rows.length]);

  // hover animation between dots (single dot only)
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const lastHoverRef = React.useRef<number | null>(null);
  const [animPrevIdx, setAnimPrevIdx] = React.useState<number | null>(null);
  const [animU, setAnimU] = React.useState(1); // 0..1 transition
  React.useEffect(() => {
    const prev = lastHoverRef.current;
    if (prev === hoverIdx) return;
    lastHoverRef.current = hoverIdx;
    setAnimPrevIdx(prev);
    setAnimU(0);
    let raf = 0;
    const start = performance.now();
    const dur = 200;
    const tick = (now: number) => {
      const p = clamp01((now - start) / dur);
      setAnimU(ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hoverIdx]);

  // tooltip state
  const [tip, setTip] = React.useState<{ x: number; y: number; row: Row } | null>(null);
  const hitsRef = React.useRef<PointHit[]>([]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = width, H = hostH;
    ctx.clearRect(0, 0, W, H);

    // ─── Layout: identical paddings to MultiSeriesLines ───
    const pad = { l: 56, r: 18, t: 10, b: 20 };
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
    const x0 = pad.l;
    const baseline = pad.t + ih;

    // Y grid + labels
    const yTicks = 4;
    ctx.save();
    ctx.font = '12px ui-sans-serif, system-ui';
    for (let i = 0; i <= yTicks; i++) {
      const y = Math.round(pad.t + (ih * i) / yTicks) + 0.5;
      const major = i % 2 === 0;
      ctx.strokeStyle = major ? ANA_COLORS.gridMajor : ANA_COLORS.gridMinor;
      ctx.lineWidth = major ? 1.25 : 0.75;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + iw, y); ctx.stroke();

      ctx.fillStyle = '#0f0f0f';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const val = Math.round((100 * (yTicks - i)) / yTicks);
      ctx.fillText(`${val}%`, x0 - 10, y);
    }
    ctx.restore();

    // X range
    const X_MARGIN = 8;
    const xStart = x0 + X_MARGIN;
    const xEnd   = x0 + iw - X_MARGIN;
    const plotW = Math.max(10, xEnd - xStart);
    const dx = rows.length > 1 ? (xEnd - xStart) / (rows.length - 1) : 0;

    // Downsample
    const MIN_GAP = Math.max(6, gap);
    const capacity = Math.max(2, Math.floor(plotW / MIN_GAP));
    let toDraw = rows;
    if (rows.length > capacity) {
      const step = Math.ceil(rows.length / capacity);
      const sampled: Row[] = [];
      for (let i = 0; i < rows.length; i += step) sampled.push(rows[i]);
      if (sampled[sampled.length - 1]?.take !== rows[rows.length - 1]?.take) {
        sampled[sampled.length - 1] = rows[rows.length - 1];
      }
      toDraw = sampled;
    }

    const n = toDraw.length; if (!n) { hitsRef.current = []; return; }

    // Points
    const Y_MARGIN = 10;
    const xs: number[] = new Array(n);
    const ys: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = toDraw[i];
      const x = xStart + i * dx;
      const yRaw = baseline - ih * clamp((r.final / 100) * t, 0, 1);
      const y = Math.max(pad.t + Y_MARGIN, Math.min(baseline - Y_MARGIN, yRaw));
      xs[i] = x; ys[i] = y;
    }

    const m = computeMonotoneSlopes(xs, ys);
    const traceCurve = () => {
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 0; i < n - 1; i++) {
        const x1 = xs[i],   y1 = ys[i];
        const x2 = xs[i+1], y2 = ys[i+1];
        const h = x2 - x1 || 1;
        const cx1x = x1 + h/3; let cx1y = y1 + (m[i]   * h)/3;
        const cx2x = x2 - h/3; let cx2y = y2 - (m[i+1] * h)/3;
        ctx.bezierCurveTo(
          cx1x, Math.max(pad.t, Math.min(baseline, cx1y)),
          cx2x, Math.max(pad.t, Math.min(baseline, cx2y)),
          x2, y2
        );
      }
    };

    // Clip to plot area
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, pad.t, iw, ih); ctx.clip();

    // Area
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xs[0], baseline);
    ctx.lineTo(xs[0], ys[0]);
    for (let i = 0; i < n - 1; i++) {
      const x1 = xs[i], y1 = ys[i], x2 = xs[i+1], y2 = ys[i+1];
      const h = x2 - x1 || 1;
      const cx1x = x1 + h/3; let cx1y = y1 + (m[i]   * h)/3;
      const cx2x = x2 - h/3; let cx2y = y2 - (m[i+1] * h)/3;
      ctx.bezierCurveTo(
        cx1x, Math.max(pad.t, Math.min(baseline, cx1y)),
        cx2x, Math.max(pad.t, Math.min(baseline, cx2y)),
        x2, y2
      );
    }
    ctx.lineTo(xs[n - 1], baseline);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, pad.t, 0, baseline);
    grad.addColorStop(0.00, 'rgba(34,197,94,0.22)');
    grad.addColorStop(0.60, 'rgba(34,197,94,0.10)');
    grad.addColorStop(1.00, 'rgba(34,197,94,0.02)');
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();

    // Line
    ctx.lineWidth = LINE_WIDTH; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = LINE_COLOR; ctx.beginPath(); traceCurve(); ctx.stroke();

    // Dots (single selection anim)
    ctx.fillStyle = DOT_FILL; ctx.strokeStyle = DOT_STROKE;
    for (let i = 0; i < n; i++) {
      let amp = 0;
      if (hoverIdx != null && animPrevIdx == null) amp = i === hoverIdx ? animU : 0;
      else if (hoverIdx == null && animPrevIdx != null) amp = i === animPrevIdx ? 1 - animU : 0;
      else if (hoverIdx != null && animPrevIdx != null) amp = i === hoverIdx ? animU : (i === animPrevIdx ? 1 - animU : 0);
      const r = DOT_R + (7 - DOT_R) * clamp01(amp);

      ctx.beginPath();
      ctx.arc(xs[i], ys[i], r, 0, Math.PI * 2);
      ctx.fill(); ctx.lineWidth = 1.75; ctx.stroke();
    }

    ctx.restore();

    // Build hover hit zones (midpoint splits)
    const half = Math.max(6, (n > 1 ? (xs[1] - xs[0]) : 12) / 2);
    hitsRef.current = xs.map((x, i) => {
      const left  = i === 0     ? x - half : (x + xs[i - 1]) / 2;
      const right = i === n - 1 ? x + half : (x + xs[i + 1]) / 2;
      return { cx: x, x1: left, x2: right, y: ys[i], row: toDraw[i] };
    });
  }, [canvasRef, width, hostH, rows, gap, t, hoverIdx, animPrevIdx, animU]);

  // hover + tooltip handlers
  const onMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let idx: number | null = null;
    for (let i = 0; i < hitsRef.current.length; i++) {
      const h = hitsRef.current[i];
      if (x >= h.x1 && x <= h.x2) { idx = i; break; }
    }
    setHoverIdx(idx);
    if (idx != null) {
      const h = hitsRef.current[idx];
      setTip({
        x: clamp(h.cx, 8, rect.width - 8),
        y: Math.max(12, h.y - 14),
        row: h.row,
      });
    } else {
      setTip(null);
    }
  }, []);
  const onMouseLeave = React.useCallback(() => { setHoverIdx(null); setTip(null); }, []);

  // compute absolute coords for portal
  const hostRect = (ref.current as HTMLDivElement | null)?.getBoundingClientRect();

  // TS-safe style
  const chartStyle: React.CSSProperties = {};
  if (typeof height === 'number' || typeof height === 'string') chartStyle.height = height;

  return (
    <div
      ref={ref}
      className="relative w-full"
      style={chartStyle}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }} />
      {tip && hostRect ? (
        <TooltipPortal left={hostRect.left + tip.x} top={hostRect.top + tip.y}>
          <div className="flex flex-col gap-1">
            <div className="font-semibold">Take {tip.row.take}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LINE_COLOR }} />
              Final: {Math.round(tip.row.final)}%
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-0.5">
              {'pitch' in tip.row.comps && tip.row.comps.pitch != null ? (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SEG_COLOR.pitch }} />
                  Pitch: {Math.round(tip.row.comps.pitch!)}%
                </div>
              ) : null}
              {'melody' in tip.row.comps && tip.row.comps.melody != null ? (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SEG_COLOR.melody }} />
                  Melody: {Math.round(tip.row.comps.melody!)}%
                </div>
              ) : null}
              {'line' in tip.row.comps && tip.row.comps.line != null ? (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SEG_COLOR.line }} />
                  Rhythm: {Math.round(tip.row.comps.line!)}%
                </div>
              ) : null}
              {'intervals' in tip.row.comps && tip.row.comps.intervals != null ? (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SEG_COLOR.intervals }} />
                  Intervals: {Math.round(tip.row.comps.intervals!)}%
                </div>
              ) : null}
            </div>
          </div>
        </TooltipPortal>
      ) : null}
    </div>
  );
}

/* ─────────── exported: symmetric top/bottom rhythm ─────────── */
export default function PerformanceOverTakes({
  scores,
  height = 200,
  reserveLegendRow = true,
  legendRowHeight = 26,     // ~chip height
  legendGapPx = 8,          // Tailwind mt-2
  reserveTopGutter = true,  // add same space above chart
}: {
  scores: TakeScore[];
  height?: number | string;
  reserveLegendRow?: boolean;
  legendRowHeight?: number;
  legendGapPx?: number;
  reserveTopGutter?: boolean;
}) {
  const rows: Row[] = React.useMemo(() => {
    return scores.map((s, i) => ({
      take: i + 1,
      final: clamp(s.final.percent, 0, 100),
      comps: {
        pitch: typeof s.pitch?.percent === 'number' ? s.pitch.percent : undefined,
        melody: typeof s.rhythm?.melodyPercent === 'number' ? s.rhythm.melodyPercent : undefined,
        line: typeof (s as any)?.rhythm?.linePercent === 'number' ? (s as any).rhythm.linePercent : undefined,
        intervals: typeof s.intervals?.correctRatio === 'number'
          ? Math.round(s.intervals.correctRatio * 10000) / 100
          : undefined,
      },
    }));
  }, [scores]);

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col p-0">
      {/* Top spacer to mirror the legend row below */}
      {reserveTopGutter ? (
        <div className="shrink-0" style={{ height: legendRowHeight + legendGapPx }} aria-hidden />
      ) : null}

      <div className="relative w-full flex-1 min-h-0">
        <LineChart rows={rows} height={height} />
      </div>

      {/* Fake legend row to keep vertical rhythm identical */}
      {reserveLegendRow ? (
        <div className="mt-2 flex flex-wrap gap-2" aria-hidden>
          <div style={{ height: legendRowHeight }} />
        </div>
      ) : null}
    </div>
  );
}
