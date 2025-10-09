// components/training/curriculum-layout/Range/RangeCard.tsx
"use client";
import React, { useMemo } from "react";
import type { SessionConfig } from "../../session/types";
import Field from "../Field";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import { scaleSemitones, type ScaleName } from "@/utils/phrase/scales";

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

/** Narrow type guard for the rhythm shape without using `any` or `unknown`. */
function isRandomMode(rhythm: SessionConfig["rhythm"] | null | undefined): boolean {
  if (!rhythm) return false;
  const r = rhythm as { mode?: string };
  return r.mode === "random";
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
  const scaleName = (cfg.scale?.name ?? "major") as ScaleName;

  const loHiM = useMemo(() => {
    if (lowHz == null || highHz == null) return null;
    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
    return { loM, hiM };
  }, [lowHz, highHz]);

  // ---- Available tonic windows inside saved range ----
  const { candidates, labels } = useMemo(() => {
    if (!loHiM) return { candidates: [] as number[], labels: [] as string[] };
    const { loM, hiM } = loHiM;
    const out: number[] = [];
    const lbl: string[] = [];
    for (let m = loM; m <= hiM - 12; m++) {
      if ((((m % 12) + 12) % 12) !== tonicPc) continue;
      out.push(m);
      const { name, octave } = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
      const hiName = midiToNoteName(m + 12, { useSharps: true, octaveAnchor: "C" });
      lbl.push(`${name}${octave}–${hiName.name}${hiName.octave}`);
    }
    return { candidates: out, labels: lbl };
  }, [loHiM, tonicPc]);

  const selectedWindows = new Set<number>((cfg.tonicMidis ?? []) as number[]);

  // --- Degree list (scale-aware) ---
  const degreeCount = useMemo(() => {
    const semis = scaleSemitones(scaleName) ?? [0, 2, 4, 5, 7, 9, 11];
    return semis.length;
  }, [scaleName]);

  const allowedDegSet = useMemo(() => new Set<number>(cfg.allowedDegrees ?? []), [cfg.allowedDegrees]);

  const toggleDegree = (idx: number) => {
    const set = new Set(allowedDegSet);
    if (set.has(idx)) set.delete(idx); else set.add(idx);
    const arr = Array.from(set).sort((a, b) => a - b);
    onChange({ allowedDegrees: arr.length ? arr : null });
  };

  const toggleTonicWindow = (m: number, next: boolean) => {
    const set = new Set(selectedWindows);
    if (next) set.add(m); else set.delete(m);
    onChange({ tonicMidis: Array.from(set).sort((a, b) => a - b) });
  };

  // Extended under/over toggles still apply (but degrees filter applies on top)
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
          Select one or more tonic windows to anchor phrases, then choose the scale degrees allowed across all octaves.
        </div>
      )}

      <Field label="Available tonic windows (1 window = tonic→tonic+octave)">
        <div className="flex flex-wrap gap-2">
          {candidates.map((m, i) => (
            <FancyCheckbox
              key={m}
              checked={selectedWindows.has(m)}
              onChange={(next) => toggleTonicWindow(m, next)}
              label={labels[i]}
            />
          ))}
          {candidates.length === 0 ? <span className="text-sm opacity-70">None</span> : null}
        </div>
      </Field>

      {candidates.length > 1 ? (
        <div className="mt-1 text-xs">
          Quick octaves:&nbsp;
          {candidates.map((m, i) => (
            <button
              key={`oct-${i}`}
              type="button"
              className={`inline-flex items-center justify-center w-6 h-6 mr-1 rounded border ${selectedWindows.has(m) ? "bg-white" : "bg-[#f5f5f5]"}`}
              title={`Octave ${i + 1}`}
              onClick={() => toggleTonicWindow(m, !selectedWindows.has(m))}
            >
              {i + 1}
            </button>
          ))}
        </div>
      ) : null}

      {/* Degree picker */}
      <div className="mt-3 grid grid-cols-1 gap-2">
        <Field label="Scale degrees (applies to all octaves)">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: degreeCount }, (_, i) => i).map((i) => (
              <FancyCheckbox
                key={`deg-${i}`}
                checked={allowedDegSet.size ? allowedDegSet.has(i) : true}
                onChange={() => toggleDegree(i)}
                label={<span>{i + 1}</span>}
              />
            ))}
          </div>
          <div className="mt-1 text-[11px] text-[#6b6b6b]">
            Leave all on to use the whole scale. Turn some off (e.g., 4 &amp; 7) to simplify.
          </div>
        </Field>
      </div>

      {/* Random-mode extended options (kept; degrees still apply) */}
      {isRandomMode(cfg.rhythm) ? (
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
        Tip: Selecting B2–B3 and C3–C4 together widens available range while degrees keep the vocabulary focused.
      </div>
    </div>
  );
}
