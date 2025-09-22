// components/training/curriculum-layout/SequenceMode/SequenceModeCard.tsx
"use client";
import React, { useMemo } from "react";
import type { SessionConfig } from "../../layout/session/types";
import type { NoteValue } from "@/utils/time/tempo";
import Field from "../Field";
import { NOTE_VALUE_OPTIONS } from "../Options";

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

function NoteLengthPicker({
  selected,
  onToggle,
}: {
  selected: Set<NoteValue>;
  onToggle: (v: NoteValue, next: boolean) => void;
}) {
  const allowed = NOTE_VALUE_OPTIONS.filter((o) =>
    [
      "whole",
      "dotted-half", "half",
      "dotted-quarter", "triplet-quarter", "quarter",
      "dotted-eighth", "triplet-eighth", "eighth",
      "sixteenth",
    ].includes(o.value)
  );
  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map((o) => {
        const isOn = selected.has(o.value);
        return (
          <FancyCheckbox
            key={o.value}
            checked={isOn}
            onChange={(next) => onToggle(o.value, next)}
            label={o.label}
          />
        );
      })}
    </div>
  );
}

export default function SequenceModeCard({
  cfg,
  onChange,
}: {
  cfg: SessionConfig;
  onChange: (patch: Partial<SessionConfig>) => void;
}) {
  const rhythmCfg = useMemo(
    () =>
      (cfg.rhythm ?? {
        mode: "random",
        available: ["quarter"],
        restProb: 0.3,
        allowRests: true,
        contentRestProb: 0.3,
        contentAllowRests: true,
        lengthBars: cfg.exerciseBars ?? 2, // legacy fallback
      }) as any,
    [cfg.rhythm, cfg.exerciseBars]
  );

  const selected = new Set<NoteValue>(rhythmCfg.available ?? ["quarter"]);

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Sequence Mode
      </div>

      {/* Mode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Mode">
          <select
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={(rhythmCfg.mode as "sequence" | "random") ?? "random"}
            onChange={(e) => {
              const mode = e.target.value as "sequence" | "random";
              onChange({
                rhythm:
                  mode === "sequence"
                    ? ({
                        ...rhythmCfg,
                        mode: "sequence",
                        pattern: rhythmCfg.pattern ?? "asc",
                      } as any)
                    : ({
                        ...rhythmCfg,
                        mode: "random",
                        lengthBars: rhythmCfg.lengthBars ?? (cfg.exerciseBars ?? 2),
                      } as any),
              });
            }}
          >
            <option value="sequence">Sequence</option>
            <option value="random">Random</option>
          </select>
        </Field>

        {/* Sequence pattern (sequence only) */}
        {rhythmCfg.mode === "sequence" ? (
          <Field label="Sequence pattern">
            <select
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              value={rhythmCfg.pattern ?? "asc"}
              onChange={(e) =>
                onChange({ rhythm: { ...rhythmCfg, pattern: e.target.value } as any })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
              <option value="asc-desc">Asc → Desc</option>
              <option value="desc-asc">Desc → Asc</option>
            </select>
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
      </div>

      {/* Random-only: length bars */}
      {rhythmCfg.mode === "random" ? (
        <div className="grid grid-cols-1 gap-2 mt-3">
          <Field label="Length (bars)">
            <input
              type="number"
              inputMode="numeric"
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              min={1}
              step={1}
              value={Math.max(1, Number(rhythmCfg.lengthBars ?? (cfg.exerciseBars ?? 2)))}
              onChange={(e) =>
                onChange({
                  rhythm: {
                    ...rhythmCfg,
                    lengthBars: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                  } as any,
                })
              }
            />
          </Field>
        </div>
      ) : null}

      {/* Available note lengths */}
      <div className="grid grid-cols-1 gap-2 mt-3">
        <Field label="Available note lengths">
          <NoteLengthPicker
            selected={selected}
            onToggle={(v, next) => {
              const nextSet = new Set(selected);
              if (next) nextSet.add(v);
              else nextSet.delete(v);
              onChange({ rhythm: { ...rhythmCfg, available: Array.from(nextSet) } as any });
            }}
          />
        </Field>
      </div>
    </div>
  );
}
