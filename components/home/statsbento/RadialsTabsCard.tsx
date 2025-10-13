// components/home/statsbento/RadialsTabsCard.tsx
'use client';

import * as React from 'react';
import PitchFocusCard from './PitchFocusCard';
import IntervalsCard from './IntervalsCard';

type TabKey = 'pitch' | 'intervals';

export default function RadialsTabsCard() {
  const [active, setActive] = React.useState<TabKey>('pitch');

  // Mirror the courses header tab styles
  const base =
    // ⬇️ add rounded corners to just the outer buttons + better focus ring
    'w-full h-10 md:h-12 text-sm md:text-base font-medium flex items-center justify-center transition select-none first:rounded-tl-2xl last:rounded-tr-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10';
  const activeCls = 'bg-[#f9f9f9] text-[#0f0f0f]';
  const idleCls = 'hover:bg-[#f5f5f5] active:bg-[#f5f5f5] text-[#0f0f0f]';

  // Nudge chart libs when a hidden tab becomes visible
  React.useEffect(() => {
    const fire = () => {
      try {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new CustomEvent('radials-tab-shown', { detail: { tab: active } }));
      } catch {}
    };
    const raf = requestAnimationFrame(fire);
    const t = setTimeout(fire, 0) as unknown as number;
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [active]);

  const isPitch = active === 'pitch';

  // Inner gutter to match other cards
  const innerPad = 'px-2 md:px-3 lg:px-4';

  return (
    // SINGLE shell using the same chrome as other cards
    <div className="min-h[360px] rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] shadow-sm flex flex-col">
      {/* Tabs */}
      {/* ⬇️ give the header the same rounded top corners and clip inside backgrounds */}
      <div className="bg-[#f2f2f2] border-b border-[#d7d7d7] rounded-t-2xl overflow-hidden">
        <div className="grid grid-cols-2">
          <button
            id="tab-pitch"
            type="button"
            className={[base, isPitch ? activeCls : idleCls].join(' ')}
            onClick={() => setActive('pitch')}
            aria-controls="panel-pitch"
            aria-selected={isPitch}
          >
            Pitch Focus
          </button>
          <button
            id="tab-intervals"
            type="button"
            className={[base, !isPitch ? activeCls : idleCls].join(' ')}
            onClick={() => setActive('intervals')}
            aria-controls="panel-intervals"
            aria-selected={!isPitch}
          >
            Intervals
          </button>
        </div>
      </div>

      {/* Body: ghost sizer is in-flow (defines height); panels overlay & fade (no reflow) */}
      <div className="relative p-6">
        {/* 👻 Ghost sizer — must mirror inner padding so the square matches real chart width */}
        <div aria-hidden className={`invisible pointer-events-none ${innerPad}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-2xl font-semibold">.</h3>
            <div className="text-sm">.</div>
          </div>
          <div className="mt-2 w-full aspect-square" />
          <div className="mt-3 h-5" />
        </div>

        {/* Overlay container with the same inner gutters */}
        <div className={`absolute inset-10 ${innerPad}`}>
          <div
            id="panel-pitch"
            role="tabpanel"
            aria-labelledby="tab-pitch"
            className={`absolute inset-0 transition-opacity duration-150 transform-gpu ${isPitch ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {/* frameless: content only; gutters provided by overlay container */}
            <PitchFocusCard frameless />
          </div>

          <div
            id="panel-intervals"
            role="tabpanel"
            aria-labelledby="tab-intervals"
            className={`absolute inset-0 transition-opacity duration-150 transform-gpu ${!isPitch ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <IntervalsCard frameless />
          </div>
        </div>
      </div>
    </div>
  );
}
