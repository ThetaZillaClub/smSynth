// components/training/layout/footer/session/SessionPanel.tsx
"use client";

import React from "react";

type TimeSig = { num: number; den: number };

type Props = {
  /** Transport */
  bpm?: number;          // default 80
  ts?: TimeSig;          // default 4/4

  /** Round info (current / total) */
  roundCurrent: number;  // 1-based
  roundTotal: number;

  className?: string;
};

function Item({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start leading-none min-w-0 ${className ?? ""}`}>
      {/* Show labels only on lg+ so height shrinks earlier */}
      <div className="hidden lg:block text-[11px] lg:text-xs text-[#2d2d2d]">{label}</div>
      <div className="text-base md:text-lg leading-tight text-[#0f0f0f] whitespace-nowrap tabular-nums">
        {value}
      </div>
    </div>
  );
}

export default function SessionPanel({
  bpm = 80,
  ts = { num: 4, den: 4 },
  roundCurrent,
  roundTotal,
  className,
}: Props) {
  return (
    // flex-auto so this panel expands/consumes available space before GameStats (Note)
    <div className={`min-w-0 flex-auto ${className ?? ""}`}>
      {/* Use a 3-col grid with gap-0 so internal space goes to ZERO before anything else */}
      <div className="grid grid-cols-3 gap-0 w-full">
        <Item label="BPM"  value={`${bpm}BPM`} />
        <Item label="Time" value={`${ts.num}/${ts.den}`} />
        <Item label="Take" value={`${roundCurrent}/${roundTotal}`} />
      </div>
    </div>
  );
}
