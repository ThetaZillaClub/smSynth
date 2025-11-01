// components/stats/HeaderSummary.tsx
'use client';
import * as React from 'react';
type StatCardProps = {
  title: string;
  main: string;
  /** 0–100 */
  valuePct: number;
  stripeBG: string; // shared page-wide gradient
};
/** Brand gradient colors (ROYGBIV variant). */
const LOGO_COLORS = ['#ff3b3b', '#ff8c00', '#ffa500', '#22c55e', '#3b82f6', '#a855f7', '#6366f1'];
function withAlpha(hex: string, alpha = 0.45) {
  const h = hex.replace('#', '');
  let r: number, g: number, b: number;
  if (h.length === 3) { r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); }
  else { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
/** Elongated & overlapping radial ribbons that read as a single stripe across the page. */
function buildPageStripeBG(colors = LOGO_COLORS) {
  const n = colors.length - 1;
  return colors.map((c, i) => {
    const x = (i / n) * 100;
    return `radial-gradient(30% 140% at ${x}% 50%, ${withAlpha(c, 0.52)} 0%, ${withAlpha(c, 0.26)} 34%, transparent 66%)`;
  }).join(', ');
}
/** Measures element’s viewport-left so the gradient can align page-wide. */
function useStripeOffset<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [left, setLeft] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setLeft(Math.round(rect.left));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    let ticking = false;
    const onEvt = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { ticking = false; update(); });
      }
    };
    window.addEventListener('scroll', onEvt, { passive: true });
    window.addEventListener('resize', onEvt, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', onEvt);
      window.removeEventListener('resize', onEvt);
    };
  }, []);
  return { ref, left };
}
/** Segmented progress bar (27 thinner pills), each pill draws its own slice of the page stripe. */
function SegmentedBar({
  pct,
  stripeBG,
  stripeOffset,
}: { pct: number; stripeBG: string; stripeOffset: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const total = 27; // ~33% more than 20; ~3.7% per pill
  const filled = Math.round((clamped / 100) * total);
  const gapPx = 2;
  // per-segment refs + measured viewport-left for correct gradient slice
  const segRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const setSegRef = React.useCallback((idx: number) => (el: HTMLDivElement | null): void => {
    segRefs.current[idx] = el; // return void to satisfy React.Ref type
  }, []);
  const [segLefts, setSegLefts] = React.useState<number[]>([]);
  React.useEffect(() => {
    const update = () => {
      setSegLefts(
        segRefs.current.map((el) => (el ? Math.round(el.getBoundingClientRect().left) : 0))
      );
    };
    update();
    let ticking = false;
    const onEvt = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { ticking = false; update(); });
      }
    };
    const ro = new ResizeObserver(onEvt);
    segRefs.current.forEach((el) => el && ro.observe(el));
    window.addEventListener('scroll', onEvt, { passive: true });
    window.addEventListener('resize',onEvt, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', onEvt);
      window.removeEventListener('resize', onEvt);
    };
  }, [total]);
  return (
    <div
      className="relative mt-1.5"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`,
        gap: `${gapPx}px`,
      }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const on = i < filled;
        const left = segLefts[i] ?? stripeOffset; // fallback until measured
        return (
          <div
            key={i}
            ref={setSegRef(i)}
            className="rounded-[6px]"
            style={{
              height: '24px',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
              ...(on
                ? {
                    // ON: gradient slice (no shorthand)
                    backgroundImage: stripeBG,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '100vw 100%',
                    backgroundPositionX: `-${left}px`,
                    backgroundPositionY: '0px',
                  }
                : {
                    // OFF: solid fill — no shorthand
                    backgroundColor: '#e6e6e6',
                  }),
            }}
          />
        );
      })}
    </div>
  );
}
function StatCard({ title, main, valuePct, stripeBG }: StatCardProps) {
  const { ref, left } = useStripeOffset<HTMLDivElement>();
  const cardStyle: React.CSSProperties & Record<'--stripe-offset', string> = {
    height: 'clamp(100px, 6vw, 120px)', // room for taller segments
    borderColor: '#d2d2d2',
    backgroundImage: 'linear-gradient(to bottom, #f2f2f2, #eeeeee)',
    '--stripe-offset': `${left}px`,
  };
  return (
    <div
      ref={ref}
      className="relative rounded-2xl border bg-gradient-to-b shadow-sm overflow-hidden flex-1 min-w-[140px]"
      style={cardStyle}
    >
      <div className="relative z-10 h-full px-3 py-2 flex flex-col justify-center">
        {/* Row 1: title — softer color so row 2 pops */}
        <div
          className="font-semibold text-[#6b6b6b] truncate leading-tight tracking-tight"
          style={{ fontSize: 'clamp(10px, 1vw, 13px)' }}
        >
          {title}
        </div>
        {/* Row 2: main value */}
        <div
          className="font-semibold tracking-tight text-[#0f0f0f] mt-0.5 truncate leading-tight"
          style={{ fontSize: 'clamp(16px, 2.6vw, 26px)' }}
        >
          {main}
        </div>
        {/* Row 3: segmented progress, gradient only inside pills */}
        <SegmentedBar pct={valuePct} stripeBG={stripeBG} stripeOffset={left} />
      </div>
    </div>
  );
}
export default function HeaderSummary({
  finalPct,
  pitchPct,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  timeOnPitchPct, // retained for future tooltips
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pitchMae, // ^
  melodyPct,
  linePct,
  intervalsPct,
}: {
  finalPct: number | null;
  pitchPct: number | null;
  timeOnPitchPct: number | null;
  pitchMae: number | null;
  melodyPct: number | null;
  linePct: number | null;
  intervalsPct: number | null;
}) {
  const stripeBG = React.useMemo(() => buildPageStripeBG(), []);
  return (
    <div className="w-full flex flex-nowrap gap-2 sm:gap-3">
      {finalPct != null && (
        <StatCard title="Final" main={`${finalPct.toFixed(0)}%`} valuePct={finalPct} stripeBG={stripeBG} />
      )}
      {pitchPct != null && (
        <StatCard title="Pitch" main={`${pitchPct.toFixed(0)}%`} valuePct={pitchPct} stripeBG={stripeBG} />
      )}
      {melodyPct != null && (
        <StatCard title="Melody rhythm" main={`${melodyPct.toFixed(0)}%`} valuePct={melodyPct} stripeBG={stripeBG} />
      )}
      {linePct != null && (
        <StatCard title="Rhythm line" main={`${linePct.toFixed(0)}%`} valuePct={linePct} stripeBG={stripeBG} />
      )}
      {intervalsPct != null && (
        <StatCard title="Intervals" main={`${intervalsPct.toFixed(0)}%`} valuePct={intervalsPct} stripeBG={stripeBG} />
      )}
    </div>
  );
}