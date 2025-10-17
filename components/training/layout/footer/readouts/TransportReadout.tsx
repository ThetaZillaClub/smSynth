// components/training/layout/footer/readouts/TransportReadout.tsx
"use client";

import React from "react";
import Readout from "./Readout";

type TimeSig = { num: number; den: number };

export default function TransportReadout({
  bpm = 80,
  ts = { num: 4, den: 4 },
  roundCurrent,
  roundTotal,
  className,
}: {
  bpm?: number;
  ts?: TimeSig;
  roundCurrent: number;  // 1-based
  roundTotal: number;
  className?: string;
}) {
  return (
    <div className={`min-w-0 flex-none ${className ?? ""}`}>
      {/* Compact right-aligned row to avoid big gaps */}
      <div className="flex items-center justify-end gap-x-3 md:gap-x-4">
        <Readout label="BPM"  value={`${bpm}BPM`} />
        <Readout label="Time" value={`${ts.num}/${ts.den}`} />
        <Readout label="Take" value={`${roundCurrent}/${roundTotal}`} />
      </div>
    </div>
  );
}
