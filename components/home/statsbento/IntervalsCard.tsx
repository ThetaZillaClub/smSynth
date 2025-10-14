// components/home/statsbento/IntervalsCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';

// Reuse hooks & utils as PitchFocusCard
import { useMeasure, useCanvas2d } from './pitch/hooks';
import { clamp01, clamp, ease } from './pitch';

type Item = { label: string; pct: number; attempts: number };

const intervalName = (s: number) =>
  ({ 0:'Unison',1:'m2',2:'M2',3:'m3',4:'M3',5:'P4',6:'TT',7:'P5',8:'m6',9:'M6',10:'m7',11:'M7',12:'Octave' } as Record<number,string>)[s] ?? `${s}`;

// dataset-bounds normalization
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

    // geometry (identical to pitch)
    const ringPad = 8;
    const labelOutset = Math.max(20, Math.min(30, minSide * 0.05));
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad - labelOutset);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = Hpx / 2;

    const vals = items.map(it => clamp01(it.pct / 100));
    const norm = normFromDataset(vals);

    // background disk
    ctx.save();
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // rings
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

    // outside label sizing (same as pitch)
    const labelFont = Math.round(Math.max(14, Math.min(16, minSide * 0.045)));
    const lblR = Rmax + labelOutset * 0.9;

    ctx.save();
    ctx.translate(cx, cy);

    for (let i = 0; i < n; i++) {
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      const mid = (a0 + a1) / 2;

      const u = norm(vals[i]);
      const rFill = r0 + (Rmax - r0) * u * t;

      // sector fill (green)
      ctx.save();
      ctx.globalAlpha = 0.60;
      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rFill), a0, a1, false);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // green rim
      ctx.save();
      ctx.strokeStyle = PR_COLORS.noteStroke;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rFill), a0, a1, false);
      ctx.stroke();
      ctx.restore();

      // hover — brighten + sheen
      if (hover === i) {
        ctx.save();
        ctx.globalCompositeOperation = 'hard-light';
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = PR_COLORS.noteFill;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(r0, rFill), a0, a1, false);
        ctx.arc(0, 0, r0, a1, a0, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const sheenInner = r0 + (Rmax - r0) * 0.48;
        const sheenOuter = r0 + (Rmax - r0) * 0.90;
        const grad = ctx.createRadialGradient(0, 0, sheenInner, 0, 0, sheenOuter);
        grad.addColorStop(0.00, 'rgba(255,255,255,0.00)');
        grad.addColorStop(0.50, 'rgba(255,255,255,0.40)');
        grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(r0, rFill), a0, a1, false);
        ctx.arc(0, 0, r0, a1, a0, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // labels OUTSIDE
      ctx.save();
      ctx.fillStyle = '#0f0f0f';
      ctx.font = `bold ${labelFont}px ui-sans-serif, system-ui`;
      const cosMid = Math.cos(mid), sinMid = Math.sin(mid);
      ctx.textAlign = cosMid > 0 ? 'left' : (cosMid < 0 ? 'right' : 'center');
      ctx.textBaseline = 'middle';
      const x = cosMid * lblR;
      const y = sinMid * lblR;
      ctx.fillText(items[i].label, x, y);
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

  // Center content (match PitchFocus: big label row, compact metric row)
  const center = React.useMemo(() => {
    if (hover == null || !items[hover]) return null;
    const it = items[hover];
    const pct = clamp(Math.round(it.pct), 0, 100);
    return { label: it.label, pct };
  }, [hover, items]);

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

      {/* Centered info */}
      {center ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="font-semibold text-[#0f0f0f] text-base sm:text-lg md:text-xl leading-none">
            {center.label}
          </div>
          <div className="mt-1 text-xs font-medium text-[#0f0f0f] flex items-center justify-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: PR_COLORS.noteFill }} />
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
