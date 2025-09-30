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
    <div className={`flex flex-col items-start ${className ?? ""}`}>
      <div className="text-xs text-[#2d2d2d]">{label}</div>
      <div className="text-lg leading-tight text-[#0f0f0f] whitespace-nowrap tabular-nums">
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
    // Do NOT take full width when placed in a row
    <div className={`min-w-0 flex-none ${className ?? ""}`}>
      {/* single row, equal-ish widths, no wrap */}
      <div className="flex items-center justify-end gap-x-4 flex-nowrap">
        <Item className="w-[6.5rem] flex-none" label="BPM"  value={`${bpm}BPM`} />
        <Item className="w-[6.5rem] flex-none" label="Time" value={`${ts.num}/${ts.den}`} />
        <Item className="w-[6.5rem] flex-none" label="Round" value={`${roundCurrent}/${roundTotal}`} />
      </div>
    </div>
  );
}
