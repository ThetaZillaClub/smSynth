// components/training/curriculum-layout/TransportCard/TransportCard.tsx
"use client";

import React from "react";
import type { SessionConfig } from "../../session";
import Field from "../Field";

export default function TransportCard({
  bpm,
  ts,
  leadBars,
  restBars,
  exerciseLoops,
  regenerateBetweenTakes,
  metronome,
  onChange,
}: {
  bpm: number;
  ts: { num: number; den: number };
  leadBars: number;
  restBars: number;
  exerciseLoops?: number;
  regenerateBetweenTakes?: boolean;
  metronome?: boolean;
  onChange: (patch: Partial<SessionConfig>) => void;
}) {
  const setBpm = (v: number) => onChange({ bpm: Math.max(20, Math.min(240, Math.floor(v))) });
  const setTSNum = (v: number) => onChange({ ts: { ...ts, num: Math.max(1, Math.floor(v)) } });
  const setTSDen = (v: number) => onChange({ ts: { ...ts, den: Math.max(1, Math.floor(v)) } });
  const setLeadBars = (v: number) => onChange({ leadBars: Math.max(0, Math.floor(v)) });
  const setRestBars = (v: number) => onChange({ restBars: Math.max(0, Math.floor(v)) });
  const setLoops = (v: number) =>
    onChange({ exerciseLoops: Math.max(1, Math.min(200, Math.floor(v))) });
  const setRegen = (v: boolean) => onChange({ regenerateBetweenTakes: v });
  const setMetronome = (v: boolean) => onChange({ metronome: v });

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Transport & Session
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="BPM">
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value || 0))}
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            min={20}
            max={240}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="TS — Numerator">
            <input
              type="number"
              value={ts.num}
              onChange={(e) => setTSNum(Number(e.target.value || 4))}
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              min={1}
            />
          </Field>
          <Field label="TS — Denominator">
            <input
              type="number"
              value={ts.den}
              onChange={(e) => setTSDen(Number(e.target.value || 4))}
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              min={1}
            />
          </Field>
        </div>

        <Field label="Lead-In (bars)">
          <input
            type="number"
            value={leadBars}
            onChange={(e) => setLeadBars(Number(e.target.value || 0))}
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            min={0}
          />
        </Field>
        <Field label="Rest (bars)">
          <input
            type="number"
            value={restBars}
            onChange={(e) => setRestBars(Number(e.target.value || 0))}
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            min={0}
          />
        </Field>

        <Field label="Exercise Loops (takes)">
          <input
            type="number"
            value={exerciseLoops ?? 24}
            onChange={(e) => setLoops(Number(e.target.value || 1))}
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            min={1}
            max={200}
          />
        </Field>

        <Field label="Regenerate phrase between takes">
          <button
            type="button"
            role="checkbox"
            aria-checked={regenerateBetweenTakes ? true : false}
            onClick={() => setRegen(!(regenerateBetweenTakes ?? false))}
            className="px-2 py-1 rounded-md border border-[#d2d2d2] bg-white text-sm"
          >
            {(regenerateBetweenTakes ?? false) ? "On" : "Off"}
          </button>
        </Field>

        <Field label="Metronome (Lead-In only)">
          <button
            type="button"
            role="checkbox"
            aria-checked={metronome ? true : false}
            onClick={() => setMetronome(!(metronome ?? true))}
            className="px-2 py-1 rounded-md border border-[#d2d2d2] bg-white text-sm"
          >
            {(metronome ?? true) ? "On" : "Off"}
          </button>
        </Field>
      </div>
    </div>
  );
}
