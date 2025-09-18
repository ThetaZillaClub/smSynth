// components/training/curriculum-layout/ScaleRhythm/ScaleRhythmCard.tsx
"use client";
import React, { useMemo } from "react";
import type { SessionConfig } from "../../layout/session/types";
import type { ScaleName } from "@/utils/phrase/scales";
import type { NoteValue } from "@/utils/time/tempo";
import Field from "../Field";
import { NOTE_VALUE_OPTIONS, TONIC_OPTIONS, SCALE_OPTIONS } from "../Options";

/* --------------------------------- Types --------------------------------- */

type RangeHint = { lo: string; hi: string; list: string; none: boolean } | null;

/* --------------------------- Reusable UI pieces --------------------------- */

/** Light box + dark check. Keeps the box light and the check itself dark. */
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
          "bg-[#f5f5f5] border-[#d2d2d2]", // light box
        ].join(" ")}
      >
        {checked ? (
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-3 w-3 text-[#0f0f0f]" // dark check
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
    ["whole", "half", "quarter", "eighth", "sixteenth", "triplet-eighth", "dotted-eighth"].includes(o.value)
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

function RestControls({
  allowRests,
  restProb,
  onAllowChange,
  onProbChange,
}: {
  allowRests: boolean;
  restProb: number;
  onAllowChange: (next: boolean) => void;
  onProbChange: (next: number) => void;
}) {
  return (
    <>
      <Field label="Allow rests">
        <FancyCheckbox
          checked={allowRests}
          onChange={onAllowChange}
          label={<span>{allowRests ? "Enabled" : "Disabled"}</span>}
        />
      </Field>

      <Field label="Rest probability">
        <input
          type="number"
          step="0.05"
          min={0}
          max={0.95}
          className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm disabled:opacity-50"
          value={allowRests ? restProb : 0}
          disabled={!allowRests}
          onChange={(e) =>
            onProbChange(Math.max(0, Math.min(0.95, Number(e.target.value) || 0.3)))
          }
        />
      </Field>
    </>
  );
}

/* --------------------------------- Card ---------------------------------- */

export default function ScaleRhythmCard({
  cfg,
  onChange,
  allowedTonicPcs,
  rangeHint,
}: {
  cfg: SessionConfig;
  onChange: (patch: Partial<SessionConfig>) => void;
  allowedTonicPcs: Set<number>;
  rangeHint: RangeHint;
}) {
  const haveRange = useMemo(
    () => allowedTonicPcs.size > 0 || rangeHint != null,
    [allowedTonicPcs, rangeHint]
  );

  const scaleCfg =
    cfg.scale ?? ({ tonicPc: 0, name: "major" as ScaleName, maxPerDegree: 2, seed: 0xC0FFEE } as const);

  const rhythmCfg = (cfg.rhythm ?? {
    mode: "random",
    available: ["quarter"],
    restProb: 0.3,
    allowRests: true,
    seed: 0xA5F3D7,
  }) as any;

  const allowRests: boolean = rhythmCfg.allowRests !== false; // default true
  const selected = new Set<NoteValue>(rhythmCfg.available ?? ["quarter"]);

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Scale & Rhythm</div>

      {/* Range hint */}
      {rangeHint ? (
        <div className="mb-2 text-xs text-[#2d2d2d]">
          Vocal range: <span className="font-semibold">{rangeHint.lo}–{rangeHint.hi}</span>.{" "}
          {rangeHint.none ? (
            <span className="text-red-600">Your saved range is narrower than an octave; no keys fully fit.</span>
          ) : (
            <>Available keys: <span className="font-semibold">{rangeHint.list}</span>.</>
          )}
        </div>
      ) : (
        <div className="mb-2 text-xs text-[#6b6b6b]">
          Select a key (will be limited once a vocal range is saved).
        </div>
      )}

      {/* Scale */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Tonic">
          <select
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={scaleCfg.tonicPc}
            onChange={(e) =>
              onChange({
                scale: {
                  ...scaleCfg,
                  tonicPc: Math.max(0, Math.min(11, Number(e.target.value) || 0)),
                } as any,
              })
            }
          >
            {TONIC_OPTIONS.map((o) => {
              const disabled = haveRange && !allowedTonicPcs.has(o.value);
              return (
                <option
                  key={o.value}
                  value={o.value}
                  disabled={disabled}
                  title={disabled ? "Out of your range" : ""}
                >
                  {o.label}
                </option>
              );
            })}
          </select>
        </Field>

        <Field label="Scale">
          <select
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={scaleCfg.name}
            onChange={(e) => onChange({ scale: { ...scaleCfg, name: e.target.value as ScaleName } })}
          >
            {SCALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Max per degree (random only)">
          <input
            type="number"
            inputMode="numeric"
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={scaleCfg.maxPerDegree ?? 2}
            min={1}
            max={8}
            onChange={(e) =>
              onChange({
                scale: {
                  ...scaleCfg,
                  maxPerDegree: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                } as any,
              })
            }
          />
        </Field>
      </div>

      {/* Rhythm */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-3">
        <Field label="Mode">
          <select
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={("mode" in rhythmCfg && rhythmCfg.mode) || "random"}
            onChange={(e) => {
              const mode = e.target.value as "sequence" | "random";
              onChange({
                rhythm:
                  mode === "sequence"
                    ? ({
                        mode: "sequence",
                        pattern: "asc",
                        available: ["quarter"],
                        restProb: 0.3,
                        allowRests: true,
                        seed: 0xD1A1,
                      } as any)
                    : ({
                        mode: "random",
                        available: ["quarter"],
                        restProb: 0.3,
                        allowRests: true,
                        seed: 0xA5F3D7,
                      } as any),
              });
            }}
          >
            <option value="sequence">Sequence</option>
            <option value="random">Random</option>
          </select>
        </Field>

        <RestControls
          allowRests={allowRests}
          restProb={rhythmCfg.restProb ?? 0.3}
          onAllowChange={(next) => onChange({ rhythm: { ...rhythmCfg, allowRests: next } as any })}
          onProbChange={(next) => onChange({ rhythm: { ...rhythmCfg, restProb: next } as any })}
        />

        {/* keep grid aligned when fewer than 4 fields in this row */}
        <div className="hidden sm:block" />
      </div>

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

      {/* Lyrics policy hint */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <Field label="Lyrics">
          <div className="text-sm">
            Uses <span className="font-semibold">solfege</span> by default (mode-aware, movable-do). You can override
            with custom words below or by importing a MIDI with karaoke lyrics.
          </div>
        </Field>
        <div className="hidden sm:block" />
      </div>
    </div>
  );
}
