// components/settings/gameplay/speed/SpeedRow.tsx
'use client';

import * as React from 'react';
import { useSpeedSetting } from '@/hooks/gameplay/useSpeedSetting';
import { effectiveBpm } from '@/utils/time/speed';

type Props = {
  baselineBpm?: number;
};

export default function SpeedRow({ baselineBpm }: Props) {
  const { percent, setPercent, labelAtEdge } = useSpeedSetting();

  const factor = percent / 100;
  const preview =
    typeof baselineBpm === 'number' && baselineBpm > 0
      ? effectiveBpm(baselineBpm, percent)
      : null;

  return (
    <div className="flex flex-col gap-2">
      {/* Label + control row */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[#0f0f0f] font-medium shrink-0">Speed</span>

        <div className="flex-1 min-w-[280px] max-w-xl">
          {/* Slider wrapper to mimic the Profile row style */}
          <div className="px-3 py-2 rounded-md bg-[#ebebeb] border border-[#d2d2d2]">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#373737] w-16 text-left select-none">
                Beginner
              </span>

              <input
                type="range"
                min={75}
                max={150}
                step={1}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                aria-label="Gameplay speed percent"
                className="w-full h-2 rounded-lg appearance-none bg-[#dcdcdc] accent-black cursor-pointer"
              />

              <span className="text-xs text-[#373737] w-8 text-right select-none">
                Pro
              </span>
            </div>

            {/* Value readout */}
            <div className="mt-2 flex flex-wrap items-center justify-between text-sm text-[#0f0f0f]">
              <div className="flex items-center gap-2">
                <span className="font-medium">{percent}%</span>
                <span className="text-[#555]">({factor.toFixed(2)}×)</span>
                {labelAtEdge && (
                  <span className="px-1.5 py-0.5 rounded bg-white border border-[#d7d7d7] text-xs">
                    {labelAtEdge}
                  </span>
                )}
              </div>

              {/* Optional preview if baseline is provided */}
              {preview != null && (
                <div className="text-[#373737]">
                  Effective BPM:&nbsp;
                  <span className="font-semibold text-[#0f0f0f]">{preview}</span>
                  <span className="ml-1 text-[#6b6b6b]">
                    (from baseline {baselineBpm})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Helper text */}
          <p className="mt-2 text-xs text-[#555]">
            Beginner = 75% of baseline BPM, Pro = 150%. We round to the nearest whole BPM during gameplay.
          </p>
        </div>

        {/* Reset button matches your button styling */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setPercent(75)}
            className={[
              'px-3 py-1.5 rounded-md text-sm',
              'bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2]',
              'hover:bg-white',
            ].join(' ')}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
