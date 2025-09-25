// components/training/curriculum-layout/Range/RangeCard.tsx
"use client";
import React, { useMemo } from "react";
import type { SessionConfig } from "../../session/types";
import Field from "../Field";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";

function FancyCheckbox({
  checked,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 select-none ${className}`}
    >
      <span
        className={[
          "relative inline-flex h-4 w-4 shrink-0 items-center justify-center",
          "rounded-[4px] border",
          "bg-[#f5f5f5] border-[#d2d2d2]",
        ].join(" ")}
      >
        {checked ? (
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="4,10 8,14 16,6" />
          </svg>
        ) : null}
      </span>
      {label ? <span className="text-sm">{label}</span> : null}
    </button>
  );
}

export default function RangeCard({
  cfg,
  lowHz,
  highHz,
  onChange,
}: {
  cfg: SessionConfig;
  lowHz: number | null;
  highHz: number | null;
  onChange: (patch: Partial<SessionConfig>) => void;
}) {
  const tonicPc = (cfg.scale?.tonicPc ?? 0) % 12;

  const { candidates, labels } = useMemo(() => {
    if (lowHz == null || highHz == null) return { candidates: [] as number[], labels: [] as string[] };

    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
    const out: number[] = [];
    const lbl: string[] = [];

    // A tonic at MIDI T represents the octave window [T, T+12]
    for (let m = loM; m <= hiM - 12; m++) {
      if ((((m % 12) + 12) % 12) !== tonicPc) continue;
      out.push(m);
      const { name, octave } = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
      const hiName = midiToNoteName(m + 12, { useSharps: true, octaveAnchor: "C" });
      lbl.push(`${name}${octave}–${hiName.name}${hiName.octave}`);
    }
    return { candidates: out, labels: lbl };
  }, [lowHz, highHz, tonicPc]);

  // Ensure stable selection shape
  const selected = new Set<number>((cfg.tonicMidis ?? []) as number[]);

  const toggleTonic = (m: number, next: boolean) => {
    const arr = new Set(selected);
    if (next) arr.add(m);
    else arr.delete(m);
    onChange({ tonicMidis: Array.from(arr).sort((a, b) => a - b) });
  };

  const showRandomOptions = (cfg.rhythm as any)?.mode === "random";

  const noneAvailable = candidates.length === 0;

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Range / Tonic Windows
      </div>

      {noneAvailable ? (
        <div className="text-xs text-red-600 mb-2">
          No full octave fits the current vocal range for this key. Try a different key or update the range.
        </div>
      ) : (
        <div className="text-xs text-[#2d2d2d] mb-2">
          Select one or more tonic windows to anchor phrases.
          {/* Example: B2–B3, C3–C4 … */}
        </div>
      )}

      <Field label="Available tonic windows (1 window = tonic→tonic+octave)">
        <div className="flex flex-wrap gap-2">
          {candidates.map((m, i) => (
            <FancyCheckbox
              key={m}
              checked={selected.has(m)}
              onChange={(next) => toggleTonic(m, next)}
              label={labels[i]}
            />
          ))}
          {candidates.length === 0 ? <span className="text-sm opacity-70">None</span> : null}
        </div>
      </Field>

      {showRandomOptions ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          <Field label="Also include notes UNDER lowest selected tonic (random mode)">
            <FancyCheckbox
              checked={!!cfg.randomIncludeUnder}
              onChange={(v) => onChange({ randomIncludeUnder: v })}
              label={<span>{cfg.randomIncludeUnder ? "Yes" : "No"}</span>}
            />
          </Field>
          <Field label="Also include notes ABOVE highest selected tonic (random mode)">
            <FancyCheckbox
              checked={!!cfg.randomIncludeOver}
              onChange={(v) => onChange({ randomIncludeOver: v })}
              label={<span>{cfg.randomIncludeOver ? "Yes" : "No"}</span>}
            />
          </Field>
        </div>
      ) : null}

      <div className="text-xs text-[#6b6b6b] mt-3">
        Tip: Selecting B2–B3 (but not B3–B4) yields phrases that stay in that lower octave —
        stabilizing the printed clef in sheet view.
      </div>
    </div>
  );
}
