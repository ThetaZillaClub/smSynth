// components/home/statsbento/IntervalsCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';
import { useHomeBootstrap } from '@/components/home/HomeBootstrap';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

const intervalName = (s: number) =>
  ({ 0:'Unison',1:'m2',2:'M2',3:'m3',4:'M3',5:'P4',6:'TT',7:'P5',8:'m6',9:'M6',10:'m7',11:'M7',12:'Octave' } as Record<number,string>)[s] ?? `${s}`;

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

/* ---------------- polar area chart (single metric) ---------------- */
type Item = { label: string; pct: number; attempts: number };

// dataset-bounds normalization; gentle gamma keeps weaker values visible
const GAMMA = 0.9;
const normFromDataset = (vals: number[]): ((v: number) => number) => {
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  const spread = vMax - vMin;
  if (!isFinite(vMin) || !isFinite(vMax) || spread <= 1e-6) {
    return () => Math.pow(0.75, GAMMA); // uniform data → consistent visible radius
  }
  return (v: number) => Math.pow(clamp01((v - vMin) / spread), GAMMA);
};

function PolarAreaIntervals({
  items,
  height = 360,
}: {
  items: Item[];
  height?: number;
}) {
  const { ref, width } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, height);

  const [t, setT] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const [tip, setTip] = React.useState<{ x: number; y: number; label: string; pct: number; attempts: number } | null>(null);

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

    const minSide = Math.min(W, H);
    if (minSide < 64) return; // guard first small pass

    // radii + ring bounds
    const ringPad = 8;
    const Rraw = minSide * 0.42;
    const R = Math.max(ringPad + 12, Rraw);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = H / 2;

    // dataset-normalized radii (normalize to OUTER bounds)
    const vals = items.map(it => clamp01(it.pct / 100));
    const norm = normFromDataset(vals);

    // background rings
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

    // sectors
    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6;
    const totalGap = gapRad * n;
    const sector = Math.max(0, (Math.PI * 2 - totalGap) / n);
    const startBase = -Math.PI / 2;

    ctx.save();
    ctx.translate(cx, cy);

    for (let i = 0; i < n; i++) {
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      const mid = (a0 + a1) / 2;

      const u = norm(vals[i]);
      const rFill = r0 + (Rmax - r0) * u * t;

      // hover underlay
      if (hover === i) {
        ctx.save();
        ctx.fillStyle = 'rgba(16,24,40,0.06)';
        ctx.beginPath();
        ctx.arc(0, 0, Rmax + 4, a0, a1, false);
        ctx.arc(0, 0, Math.max(0, r0 - 4), a1, a0, true);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // filled sector
      ctx.save();
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rFill), a0, a1, false);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // subtle rim
      ctx.save();
      ctx.strokeStyle = PR_COLORS.noteStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rFill), a0, a1, false);
      ctx.stroke();
      ctx.restore();

      // label outside
      const lblR = Rmax + 16;
      ctx.save();
      ctx.fillStyle = '#0f0f0f';
      ctx.font = '14px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(items[i].label, Math.cos(mid) * lblR, Math.sin(mid) * lblR);
      ctx.restore();
    }

    // focus ring
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
  }, [canvasRef, width, height, items, t, hover]);

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

    // tooltip near normalized radius
    const vals = items.map(it => clamp01(it.pct / 100));
    const norm = normFromDataset(vals);
    const u = norm(vals[idx]);

    const Rdraw = r0 + (Rmax - r0) * u; // current radius (no easing needed for tip)
    const mid = (startBase + idx * cluster) + sector / 2;

    const tipX = clamp(cx + Math.cos(mid) * (Rdraw + 12), 8, W - 8);
    const tipY = clamp(cy + Math.sin(mid) * (Rdraw + 12), 8, H - 8);

    const it = items[idx];
    setTip({
      x: tipX, y: tipY,
      label: it.label,
      pct: Math.round(it.pct),
      attempts: it.attempts,
    });
  }, [items, canvasRef]);

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
              {tip.pct}% correct
            </span>
            <span className="text-[#373737]">·</span>
            <span className="text-[#0f0f0f]">{tip.attempts} attempts</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- card + data ---------------- */
export default function IntervalsCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const { uid } = useHomeBootstrap();
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<Item[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        // allow auth token to hydrate, but don't fetch the user — we have uid from bootstrap
        await ensureSessionReady(supabase, 2000);

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
          const g = by.get(r.semitones)!;
          g.a += Number(r.attempts || 0);
          g.c += Number(r.correct || 0);
        }

        // Keep anchors (even if 0%) so chart has context
        const anchors = new Set([0, 2, 3, 7, 12]);
        const list = Array.from({ length: 13 }, (_, s) => {
          const v = by.get(s)!;
          const pct = v.a ? Math.round((100 * v.c) / v.a) : 0;
          return { s, label: intervalName(s), pct, attempts: v.a };
        })
          .filter(x => x.pct > 0 || anchors.has(x.s))
          .map(({ label, pct, attempts }) => ({ label, pct, attempts }));

        if (!cancelled) setItems(list);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, uid]);

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
        <PolarAreaIntervals items={items} height={360} />
      )}
      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
