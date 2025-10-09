// components/training/curriculum-layout/SequenceMode/SequenceModeCard.tsx
"use client";
import React, { useMemo } from "react";
import type { SessionConfig, RhythmConfig } from "../../session/types";
import type { NoteValue } from "@/utils/time/tempo";
import Field from "../Field";
import { NOTE_VALUE_OPTIONS } from "../Options";

const INTERVAL_OPTIONS = [
  { label: "Minor Second", value: 1 },
  { label: "Major Second", value: 2 },
  { label: "Minor Third", value: 3 },
  { label: "Major Third", value: 4 },
  { label: "Perfect Fourth", value: 5 },
  { label: "Tritone", value: 6 },
  { label: "Perfect Fifth", value: 7 },
  { label: "Minor Sixth", value: 8 },
  { label: "Major Sixth", value: 9 },
  { label: "Minor Seventh", value: 10 },
  { label: "Major Seventh", value: 11 },
  { label: "Octave", value: 12 },
];

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
      "dotted-half",
      "half",
      "dotted-quarter",
      "triplet-quarter",
      "quarter",
      "dotted-eighth",
      "triplet-eighth",
      "eighth",
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

// --- Type guards for RhythmConfig branches ---
function isSequence(r: RhythmConfig): r is Extract<RhythmConfig, { mode: "sequence" }> {
  return r.mode === "sequence";
}
function isRandom(r: RhythmConfig): r is Extract<RhythmConfig, { mode: "random" }> {
  return r.mode === "random";
}
function isInterval(r: RhythmConfig): r is Extract<RhythmConfig, { mode: "interval" }> {
  return r.mode === "interval";
}

export default function SequenceModeCard({
  cfg,
  onChange,
}: {
  cfg: SessionConfig;
  onChange: (patch: Partial<SessionConfig>) => void;
}) {
  // Strongly-typed rhythm with defaults
  const rhythmCfg: RhythmConfig = useMemo(
    () =>
      cfg.rhythm ?? {
        mode: "random",
        available: ["quarter"],
        restProb: 0.3,
        allowRests: true,
        contentRestProb: 0.3,
        contentAllowRests: true,
        lengthBars: cfg.exerciseBars ?? 2, // legacy fallback
      },
    [cfg.rhythm, cfg.exerciseBars]
  );

  const selected = new Set<NoteValue>(rhythmCfg.available ?? ["quarter"]);

  // Common fields we want to preserve when switching modes
  const makeCommon = (r: RhythmConfig) => ({
    available: r.available ?? ["quarter" as NoteValue],
    restProb: r.restProb ?? 0.3,
    allowRests: r.allowRests ?? true,
    contentRestProb: r.contentRestProb ?? 0.3,
    contentAllowRests: r.contentAllowRests ?? true,
    lengthBars: r.lengthBars ?? (cfg.exerciseBars ?? 2),
    seed: r.seed,
    lineEnabled: r.lineEnabled,
    detectEnabled: r.detectEnabled,
  });

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Exercise Mode
      </div>

      {/* Mode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Mode">
          <select
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={rhythmCfg.mode}
            onChange={(e) => {
              const mode = e.target.value as "sequence" | "random" | "interval";
              const common = makeCommon(rhythmCfg);

              let next: RhythmConfig;
              if (mode === "sequence") {
                const pattern =
                  (isSequence(rhythmCfg) && rhythmCfg.pattern) || "asc";
                next = {
                  mode: "sequence",
                  pattern,
                  ...common,
                };
              } else if (mode === "random") {
                next = {
                  mode: "random",
                  ...common,
                };
              } else {
                // interval
                const intervals =
                  (isInterval(rhythmCfg) && rhythmCfg.intervals) || [3, 5];
                const numIntervals =
                  (isInterval(rhythmCfg) && rhythmCfg.numIntervals) || 8;
                next = {
                  mode: "interval",
                  intervals,
                  numIntervals,
                  ...common,
                };
              }

              onChange({ rhythm: next });
            }}
          >
            <option value="random">Random</option>
            <option value="sequence">Sequence</option>
            <option value="interval">Interval Training</option>
          </select>
        </Field>

        {/* Sequence-only pattern */}
        {isSequence(rhythmCfg) ? (
          <Field label="Sequence pattern">
            <select
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              value={rhythmCfg.pattern ?? "asc"}
              onChange={(e) => {
                const pattern = e.target.value as
                  | "asc"
                  | "desc"
                  | "asc-desc"
                  | "desc-asc";
                const next: Extract<RhythmConfig, { mode: "sequence" }> = {
                  ...rhythmCfg,
                  pattern,
                };
                onChange({ rhythm: next });
              }}
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
      {isRandom(rhythmCfg) ? (
        <div className="grid grid-cols-1 gap-2 mt-3">
          <Field label="Length (bars)">
            <input
              type="number"
              inputMode="numeric"
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              min={1}
              step={1}
              value={Math.max(1, Number(rhythmCfg.lengthBars ?? (cfg.exerciseBars ?? 2)))}
              onChange={(e) => {
                const lengthBars = Math.max(
                  1,
                  Math.floor(Number(e.target.value) || 1)
                );
                const next: Extract<RhythmConfig, { mode: "random" }> = {
                  ...rhythmCfg,
                  lengthBars,
                };
                onChange({ rhythm: next });
              }}
            />
          </Field>
        </div>
      ) : null}

      {/* Interval Training */}
      {isInterval(rhythmCfg) && (
        <div className="mt-3">
          <Field label="Intervals">
            <div className="flex flex-wrap gap-2">
              {INTERVAL_OPTIONS.map((o) => {
                const current = rhythmCfg.intervals ?? [3, 5];
                const isOn = current.includes(o.value);
                return (
                  <FancyCheckbox
                    key={o.value}
                    checked={isOn}
                    onChange={(next) => {
                      const curr = [...(rhythmCfg.intervals ?? [3, 5])];
                      if (next && !curr.includes(o.value)) curr.push(o.value);
                      else if (!next) {
                        const idx = curr.indexOf(o.value);
                        if (idx >= 0) curr.splice(idx, 1);
                      }
                      const nextCfg: Extract<RhythmConfig, { mode: "interval" }> = {
                        ...rhythmCfg,
                        intervals: curr.sort((a, b) => a - b),
                      };
                      onChange({ rhythm: nextCfg });
                    }}
                    label={o.label}
                  />
                );
              })}
            </div>
          </Field>

          <Field label="Number of intervals">
            <input
              type="number"
              inputMode="numeric"
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              min={1}
              step={1}
              value={rhythmCfg.numIntervals ?? 8}
              onChange={(e) => {
                const numIntervals = Math.max(
                  1,
                  Math.floor(Number(e.target.value) || 8)
                );
                const nextCfg: Extract<RhythmConfig, { mode: "interval" }> = {
                  ...rhythmCfg,
                  numIntervals,
                };
                onChange({ rhythm: nextCfg });
              }}
            />
          </Field>
        </div>
      )}

      {/* Available note lengths */}
      <div className="grid grid-cols-1 gap-2 mt-3">
        <Field label="Available note lengths">
          <NoteLengthPicker
            selected={selected}
            onToggle={(v, next) => {
              const nextSet = new Set(selected);
              if (next) nextSet.add(v);
              else nextSet.delete(v);
              const available = Array.from(nextSet);

              let updated: RhythmConfig;
              if (isSequence(rhythmCfg)) {
                updated = { ...rhythmCfg, available };
              } else if (isRandom(rhythmCfg)) {
                updated = { ...rhythmCfg, available };
              } else {
                // interval
                updated = { ...rhythmCfg, available };
              }
              onChange({ rhythm: updated });
            }}
          />
        </Field>
      </div>
    </div>
  );
}
