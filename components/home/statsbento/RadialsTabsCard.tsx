// components/home/statsbento/RadialsTabsCard.tsx
'use client';

import * as React from 'react';
import PitchFocusCard from './PitchFocusCard';
import IntervalsCard from './IntervalsCard';
import { PR_COLORS } from '@/utils/stage';

type TabKey = 'pitch' | 'intervals';

export default function RadialsTabsCard() {
  const [active, setActive] = React.useState<TabKey>('pitch');

  // re-measure canvases on tab switch
  React.useEffect(() => {
    const fire = () => {
      try {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new CustomEvent('radials-tab-shown', { detail: { tab: active } }));
      } catch {}
    };
    const raf = requestAnimationFrame(fire);
    const t = setTimeout(fire, 0) as unknown as number;
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [active]);

  const SegBtn = ({
    on, children, onClick, first, last,
  }: {
    on: boolean;
    children: React.ReactNode;
    onClick: () => void;
    first?: boolean;
    last?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 h-8 text-sm font-medium transition select-none',
        'border border-[#d7d7d7]',
        on ? 'bg-[#f9f9f9] text-[#0f0f0f]' : 'bg-[#f5f5f5] hover:bg-[#f7f7f7] text-[#0f0f0f]',
        first ? 'rounded-l-full' : '',
        last ? 'rounded-r-full -ml-px' : '-ml-px',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10',
      ].join(' ')}
      aria-pressed={on}
    >
      {children}
    </button>
  );

  const LegendTag = ({ dot, label }: { dot: string; label: string }) => (
    <span
      className={[
        'inline-flex items-center justify-center gap-1 rounded-full',
        'h-6 px-2 text-[11px] font-medium leading-none whitespace-nowrap tabular-nums',
        'bg-[#f9f9f9] text-[#0f0f0f] border border-[#d7d7d7]',
      ].join(' ')}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
      <span>{label}</span>
    </span>
  );

  const isPitch = active === 'pitch';

  return (
    <div className="relative h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-6 shadow-sm flex flex-col">
      {/* Header aligned like Session Performance, with segmented tabs */}
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Analytics</h3>
        <div className="inline-flex items-center">
          <SegBtn first on={isPitch} onClick={() => setActive('pitch')}>Pitch</SegBtn>
          <SegBtn last  on={!isPitch} onClick={() => setActive('intervals')}>Intervals</SegBtn>
        </div>
      </div>

      {/* Body fills remaining space; crossfading overlay */}
      <div className="mt-2 flex-1 min-h-0 relative overflow-hidden mb-8">
        <div
          id="panel-pitch"
          className={[
            'absolute inset-0 transform-gpu will-change-opacity transition-opacity duration-300 ease-in-out',
            isPitch ? 'opacity-100' : 'opacity-0 pointer-events-none',
          ].join(' ')}
          aria-hidden={!isPitch}
        >
          <PitchFocusCard frameless fill />
        </div>

        <div
          id="panel-intervals"
          className={[
            'absolute inset-0 transform-gpu will-change-opacity transition-opacity duration-300 ease-in-out',
            !isPitch ? 'opacity-100' : 'opacity-0 pointer-events-none',
          ].join(' ')}
          aria-hidden={isPitch}
        >
          <IntervalsCard frameless fill />
        </div>
      </div>

      {/* Bottom-right legend (aligned to card padding) */}
      <div className="pointer-events-none absolute bottom-6 right-6 flex items-center gap-2 sm:gap-3">
        {isPitch ? (
          <>
            <div className="pointer-events-auto">
              <LegendTag dot={PR_COLORS.noteFill} label="On-pitch %" />
            </div>
            <div className="pointer-events-auto">
              <LegendTag dot="#3b82f6" label="MAE ¢" />
            </div>
          </>
        ) : (
          <div className="pointer-events-auto">
            <LegendTag dot={PR_COLORS.noteFill} label="Correct %" />
          </div>
        )}
      </div>
    </div>
  );
}
