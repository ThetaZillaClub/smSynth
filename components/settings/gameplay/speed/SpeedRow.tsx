// components/settings/gameplay/speed/SpeedRow.tsx
"use client";

import * as React from "react";
import { useSpeedSetting } from "@/hooks/gameplay/useSpeedSetting";

type Props = { baselineBpm?: number };

export default function SpeedRow({}: Props) {
  const { percent, setPercent } = useSpeedSetting();
  const factor = percent / 100;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">Speed</span>

      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <span className="text-xs text-[#6b6b6b] w-16 text-left select-none">Beginner</span>

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

        <span className="text-xs text-[#6b6b6b] w-8 text-right select-none">Pro</span>
      </div>

      <div className="text-sm text-[#0f0f0f] w-[120px] text-right">
        <span className="font-medium">{percent}%</span>
        <span className="ml-1 text-[#6b6b6b]">({factor.toFixed(2)}×)</span>
      </div>
    </div>
  );
}
