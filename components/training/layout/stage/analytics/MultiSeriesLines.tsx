// components/training/layout/stage/analytics/MultiSeriesLines.tsx
"use client";

import * as React from "react";
import { ANA_COLORS, colorForKey, withAlpha } from "./colors";

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

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
  const [dpr, setDpr] = React.useState(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  React.useEffect(() => {
    const h = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
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
    const ctx = c.getContext("2d"); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height, dpr]);
  return { ref, dpr };
}

/* ── monotone cubic with Hyman filter (no overshoot) ── */
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

export type Series = {
  label: string;
  values: Array<number | null>;
};

export default function MultiSeriesLines({
  title, // unused
  series,
  height = "100%",
  yMin = 0,
  yMax = 100,
  ySuffix = "%",
  maxSeriesLegend = 8,
  invertY = false,
  // new: mirror the legend height above the chart
  reserveTopGutter = true,
  legendRowHeight = 26,
  legendGapPx = 8, // Tailwind mt-2
}: {
  title?: string;
  series: Series[];
  height?: number | string;
  yMin?: number;
  yMax?: number;
  ySuffix?: string;
  maxSeriesLegend?: number;
  invertY?: boolean;
  reserveTopGutter?: boolean;
  legendRowHeight?: number;
  legendGapPx?: number;
}) {
  const N = series.reduce((m, s) => Math.max(m, s.values.length), 0);
  const { ref, width, height: hostH } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, hostH);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const W = width, H = hostH;
    ctx.clearRect(0, 0, W, H);

    const pad = { l: 56, r: 18, t: 10, b: 20 };
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
    const x0 = pad.l, y0 = pad.t;
    const baseline = y0 + ih;

    // y grid + labels
    ctx.save();
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textBaseline = "middle"; ctx.textAlign = "right";
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const y = Math.round(y0 + (ih * i) / yTicks) + 0.5;
      const major = i % 2 === 0;
      ctx.strokeStyle = major ? ANA_COLORS.gridMajor : ANA_COLORS.gridMinor;
      ctx.lineWidth = major ? 1.25 : 0.75;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + iw, y); ctx.stroke();

      const val = invertY
        ? Math.round(yMin + ((yMax - yMin) * i) / yTicks)
        : Math.round(yMax - ((yMax - yMin) * i) / yTicks);
      ctx.fillStyle = "#0f0f0f";
      ctx.fillText(`${val}${ySuffix}`, x0 - 10, y);
    }
    ctx.restore();

    // x coords
    const xStart = x0 + 8;
    const xEnd = x0 + iw - 8;
    const dx = N > 1 ? (xEnd - xStart) / (N - 1) : 0;

    // map value → y
    const yFor = (v: number) => {
      const t = clamp((v - yMin) / Math.max(1e-6, (yMax - yMin)), 0, 1);
      const u = invertY ? t : 1 - t;
      return y0 + u * ih;
    };

    // helpers for curved path
    const traceCurve = (xs: number[], ys: number[]) => {
      const n = xs.length; if (n === 0) return;
      if (n === 1) { ctx.lineTo(xs[0], ys[0]); return; }
      const m = computeMonotoneSlopes(xs, ys);
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 0; i < n - 1; i++) {
        const x1 = xs[i],   y1 = ys[i];
        const x2 = xs[i+1], y2 = ys[i+1];
        const h = x2 - x1 || 1;
        const cx1x = x1 + h/3; let cx1y = y1 + (m[i]   * h)/3;
        const cx2x = x2 - h/3; let cx2y = y2 - (m[i+1] * h)/3;
        ctx.bezierCurveTo(
          cx1x, Math.max(y0, Math.min(baseline, cx1y)),
          cx2x, Math.max(y0, Math.min(baseline, cx2y)),
          x2, y2
        );
      }
    };

    const fillCurve = (stroke: string, xs: number[], ys: number[]) => {
      const n = xs.length; if (n < 2) return;
      const m = computeMonotoneSlopes(xs, ys);

      ctx.beginPath();
      ctx.moveTo(xs[0], baseline);
      ctx.lineTo(xs[0], ys[0]);
      for (let i = 0; i < n - 1; i++) {
        const x1 = xs[i],   y1 = ys[i];
        const x2 = xs[i+1], y2 = ys[i+1];
        const h = x2 - x1 || 1;
        const cx1x = x1 + h/3; let cx1y = y1 + (m[i]   * h)/3;
        const cx2x = x2 - h/3; let cx2y = y2 - (m[i+1] * h)/3;
        ctx.bezierCurveTo(
          cx1x, Math.max(y0, Math.min(baseline, cx1y)),
          cx2x, Math.max(y0, Math.min(baseline, cx2y)),
          x2, y2
        );
      }
      ctx.lineTo(xs[n - 1], baseline);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, y0, 0, baseline);
      grad.addColorStop(0.00, withAlpha(stroke, 0.22));
      grad.addColorStop(0.70, withAlpha(stroke, 0.08));
      grad.addColorStop(1.00, withAlpha(stroke, 0.02));
      ctx.fillStyle = grad;
      ctx.fill();
    };

    // plot each series
    for (let sIdx = 0; sIdx < series.length; sIdx++) {
      const s = series[sIdx]!;
      const stroke = colorForKey(s.label);
      const dotFill = withAlpha(stroke, 0.18);

      const xsAll = new Array<number>(N);
      const ysAll = new Array<number>(N);
      const def = new Array<boolean>(N).fill(false);
      for (let i = 0; i < N; i++) {
        const v = s.values[i];
        if (v == null || !Number.isFinite(v)) continue;
        xsAll[i] = xStart + dx * i;
        ysAll[i] = yFor(v);
        def[i] = true;
      }

      const idxs: number[] = [];
      for (let i = 0; i < N; i++) if (def[i]) idxs.push(i);
      if (idxs.length === 0) continue;

      const firstIdx = idxs[0];
      const lastIdx = idxs[idxs.length - 1];

      let xsPath: number[] = [];
      let ysPath: number[] = [];

      if (idxs.length === 1) {
        xsPath = [xStart, xEnd];
        ysPath = [ysAll[firstIdx], ysAll[firstIdx]];
      } else {
        if (firstIdx > 0) { xsPath.push(xStart); ysPath.push(ysAll[firstIdx]); }
        for (const i of idxs) { xsPath.push(xsAll[i]); ysPath.push(ysAll[i]); }
        if (lastIdx < N - 1) { xsPath.push(xEnd); ysPath.push(ysAll[lastIdx]); }
      }

      // area
      fillCurve(stroke, xsPath, ysPath);

      // line
      const ctx = (canvasRef.current as HTMLCanvasElement).getContext("2d")!;
      ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      traceCurve(xsPath, ysPath);
      ctx.stroke();

      // dots on defined takes
      ctx.fillStyle = dotFill; ctx.strokeStyle = stroke;
      for (let i = 0; i < N; i++) {
        if (!def[i]) continue;
        const x = xsAll[i], y = ysAll[i];
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.75; ctx.stroke();
      }
    }
  }, [canvasRef, width, hostH, series, yMin, yMax, ySuffix, N, invertY]);

  // TS-safe style object for optional numeric height
  const chartStyle: React.CSSProperties = {};
  if (typeof height === "number") chartStyle.height = height;
  if (typeof height === "string") chartStyle.height = height;

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col p-0">
      {/* Top spacer to mirror the legend row below */}
      {reserveTopGutter ? (
        <div className="shrink-0" style={{ height: legendRowHeight + legendGapPx }} aria-hidden />
      ) : null}

      <div
        ref={ref}
        className="relative w-full flex-1 min-h-0"
        style={chartStyle}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", borderRadius: 12 }}
        />
      </div>

      {/* Legend */}
      {series.length ? (
        <div className="mt-2 flex flex-wrap gap-2 overflow-x-auto">
          {series.slice(0, maxSeriesLegend).map((s) => {
            const color = colorForKey(s.label);
            return (
              <div
                key={s.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e5e5] px-2 py-1"
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[11px] text-[#333]">{s.label}</span>
              </div>
            );
          })}
          {series.length > maxSeriesLegend ? (
            <span className="text-[11px] text-[#777]">+{series.length - maxSeriesLegend} more</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
