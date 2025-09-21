// components/training/layout/transport/TransportPanelControlled.tsx
"use client";

import React, { useCallback } from "react";
import type { TimeSignature } from "@/utils/time/tempo";

type Props = {
  bpm: number;
  ts: TimeSignature;
  /** Lead-in in bars (not beats) */
  leadBars: number;
  /** Rest between takes, in bars */
  restBars: number;
  onChange: (v: {
    bpm?: number;
    ts?: TimeSignature;
    leadBars?: number;
    restBars?: number;
  }) => void;
};

export default function TransportPanelControlled({
  bpm,
  ts,
  leadBars,
  restBars,
  onChange,
}: Props) {
  const onNum = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, fn: (n: number) => void) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) fn(v);
    },
    []
  );

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Transport</div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* BPM */}
        <Field label="BPM">
          <input
            type="number"
            inputMode="numeric"
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={bpm}
            min={20}
            max={300}
            onChange={(e) => onNum(e, (n) => onChange({ bpm: Math.max(1, Math.floor(n)) }))}
          />
        </Field>

        {/* Time Signature */}
        <Field label="Time Signature">
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              value={ts.num}
              min={1}
              max={32}
              onChange={(e) =>
                onNum(e, (n) => onChange({ ts: { num: Math.max(1, Math.floor(n)), den: ts.den } }))
              }
              aria-label="Time signature numerator"
            />
            <span className="text-sm opacity-70">/</span>
            <input
              type="number"
              inputMode="numeric"
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              value={ts.den}
              min={1}
              max={32}
              onChange={(e) =>
                onNum(e, (n) => onChange({ ts: { num: ts.num, den: Math.max(1, Math.floor(n)) } }))
              }
              aria-label="Time signature denominator"
            />
          </div>
        </Field>

        {/* Lead-in (bars) */}
        <Field label="Lead-in (bars)">
          <input
            type="number"
            inputMode="decimal"
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={leadBars}
            min={0}
            step={0.5}
            onChange={(e) => onNum(e, (n) => onChange({ leadBars: Math.max(0, Number(n) || 0) }))}
/>
        </Field>

        {/* Rest (bars) */}
        <Field label="Rest (bars)">
          <input
            type="number"
            inputMode="decimal"
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={restBars}
            min={0.125}
            step={0.25}
            onChange={(e) =>
              onNum(e, (n) => onChange({ restBars: Math.max(0.125, Number(n) || 0.125) }))
            }
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{label}</div>
      {children}
    </div>
  );
}
