// components/home/statsbento/IntervalsCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';

const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const intervalName = (s: number) =>
  ({ 0:'Unison',1:'m2',2:'M2',3:'m3',4:'M3',5:'P4',6:'TT',7:'P5',8:'m6',9:'M6',10:'m7',11:'M7',12:'Octave' } as Record<number,string>)[s] ?? `${s}`;

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

type Item = { label: string; v1: number };

type Hit = {
  x1: number; x2: number; cx: number;
  top: number; h: number;
};

function VerticalSticks({
  items,
  max = 100,
  height = 360,
  stickW = 14,
  gap = 20,
}: {
  items: Item[];
  max?: number; height?: number; stickW?: number; gap?: number;
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
    ctx.clearRect(0, 0, W, H);

    // Layout paddings & gutters (match Pitch Focus feel)
    const pad = { l: 66, r: 48, t: 10, b: 22 };
    const innerGutter = 16;   // padding between Y labels and plot
    const labelGap = 16;      // text offset from plot edge
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
    const baseline = pad.t + ih;

    // Plot rect
    const plotL = pad.l + innerGutter;
    const plotR = pad.l + iw - innerGutter;
    const plotW = Math.max(10, plotR - plotL);

    // GRID + left Y axis (0..100%)
    const ticks = 4;
    ctx.save();
    ctx.font = '14px ui-sans-serif, system-ui';
    for (let i = 0; i <= ticks; i++) {
      const y = Math.round(pad.t + (ih * i) / ticks) + 0.5;
      const major = i % 2 === 0;
      ctx.strokeStyle = major ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = major ? 1.25 : 0.75;
      ctx.beginPath(); ctx.moveTo(plotL, y); ctx.lineTo(plotR, y); ctx.stroke();

      ctx.fillStyle = '#0f0f0f';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const val = Math.round((max * (ticks - i)) / ticks);
      ctx.fillText(`${val}%`, plotL - labelGap, y);
    }
    ctx.restore();

    // FIT: scale bar width + gaps to always fit
    const n = items.length;
    const MIN_STICK = 4;
    const MIN_GAP = 4;

    const baseTotal = n * stickW + Math.max(0, n - 1) * gap; // single bar per interval
    let scale = baseTotal > plotW ? plotW / baseTotal : 1;

    let sW = Math.max(MIN_STICK, Math.floor(stickW * scale));
    let g = Math.max(MIN_GAP, Math.floor(gap * scale));

    let total = n * sW + Math.max(0, n - 1) * g;
    if (total > plotW) {
      // reduce gaps to min, then shrink bars if needed
      g = MIN_GAP;
      const targetForBars = plotW - Math.max(0, n - 1) * g;
      sW = Math.max(MIN_STICK, Math.floor(targetForBars / n));
      total = n * sW + Math.max(0, n - 1) * g;
      while (total > plotW && sW > MIN_STICK) {
        sW -= 1;
        total = n * sW + Math.max(0, n - 1) * g;
      }
    }

    const x0 = plotL + Math.max(0, Math.floor((plotW - total) / 2));

    // DRAW (clip to plot)
    hitsRef.current = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotL + 0.5, pad.t + 0.5, plotW - 1, ih - 1);
    ctx.clip();

    for (let i = 0; i < n; i++) {
      const it = items[i];
      const x = x0 + i * (sW + g);

      const h = ih * clamp01((clamp(it.v1, 0, max) / max)) * t;
      const y = baseline - h;

      // hover band
      if (hover === i) {
        ctx.save();
        ctx.fillStyle = 'rgba(16,24,40,0.06)';
        const bandPad = 6;
        ctx.fillRect(x - bandPad, pad.t + 2, sW + bandPad * 2, ih - 2);
        ctx.restore();
      }

      // bar
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.fillRect(Math.round(x), Math.round(y), sW, Math.max(0, Math.round(h)));

      ctx.restore();

      // stroke
      ctx.lineWidth = 1;
      ctx.strokeStyle = PR_COLORS.noteStroke;
      ctx.strokeRect(x + 0.5, y + 0.5, sW - 1, Math.max(0, Math.round(h) - 1));

      // hover value
      if (hover === i) {
        ctx.save();
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#0f0f0f';
        const dv = clamp(Math.round(it.v1), 0, max);
        ctx.fillText(`${dv}%`, x + sW / 2, y - 6);
        ctx.restore();

        // connector
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + sW / 2, y - 4); ctx.lineTo(x + sW / 2, y); ctx.stroke();
        ctx.restore();
      }

      hitsRef.current.push({
        x1: x, x2: x + sW, cx: x + sW / 2,
        top: y, h,
      });
    }

    // focus ring
    if (hover != null && hitsRef.current[hover]) {
      const h = hitsRef.current[hover];
      const left = h.x1 - 6, right = h.x2 + 6;
      ctx.save();
      ctx.strokeStyle = 'rgba(16,24,40,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(left + 0.5, pad.t + 1.5, Math.max(0, right - left), ih - 3);
      ctx.restore();
    }

    ctx.restore(); // end clip

    // X labels (clamped to plot)
    const labelStep = Math.max(1, Math.ceil(n / 8));
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotL, pad.t, plotW, ih + 28);
    ctx.clip();
    ctx.fillStyle = '#0f0f0f'; ctx.font = '14px ui-sans-serif, system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';

    for (let i = 0; i < n; i++) {
      if (i % labelStep !== 0) continue;
      const cx = x0 + i * (sW + g) + sW / 2;
      const center = clamp(cx, plotL + 8, plotR - 8);
      ctx.fillText(items[i].label, center, baseline + 6);
    }
    ctx.restore();
  }, [canvasRef, width, height, items, max, stickW, gap, t, hover]);

  // hover + tooltip
  const [tip, setTip] = React.useState<{ x: number; y: number; label: string; v1: number } | null>(null);
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
      const tipY = h.top - 14;
      setTip({
        x: tipX,
        y: Math.max(12, tipY),
        label: it.label,
        v1: clamp(Math.round(it.v1), 0, max),
      });
    } else {
      setTip(null);
    }
  }, [items, max]);
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
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function IntervalsCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<{ label: string; v1: number }[]>([]);

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

        const iQ = await supabase
          .from('lesson_result_interval_classes')
          .select('result_id, semitones, attempts, correct')
          .in('result_id', recentIds);
        if (iQ.error) throw iQ.error;

        const by = new Map<number, { a: number; c: number }>(); for (let i = 0; i <= 12; i++) by.set(i,{a:0,c:0});
        for (const r of (iQ.data ?? []) as any[]) {
          const g = by.get(r.semitones)!; g.a += Number(r.attempts || 0); g.c += Number(r.correct || 0);
        }

        // Semitone order 0..12; keep anchors (even if 0%) so chart has context
        const anchors = new Set([0, 2, 3, 7, 12]);
        const list = Array.from({ length: 13 }, (_, s) => {
          const v = by.get(s)!;
          const pct = v.a ? Math.round((100 * v.c) / v.a) : 0;
          return { s, label: intervalName(s), v1: pct };
        })
          .filter(x => x.v1 > 0 || anchors.has(x.s))
          .map(({ label, v1 }) => ({ label, v1 }));

        if (!cancelled) setItems(list);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-white to-[#f7f7f7] p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Intervals</h3>
        <div className="text-sm text-[#0f0f0f]">Correct % by class</div>
      </div>
      {loading ? (
        <div className="h-[78%] mt-2 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : items.length === 0 ? (
        <div className="h-[78%] mt-2 flex items-center justify-center text-base text-[#0f0f0f]">
          No interval attempts yet.
        </div>
      ) : (
        <VerticalSticks items={items} height={360} stickW={14} gap={20} max={100} />
      )}
      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
