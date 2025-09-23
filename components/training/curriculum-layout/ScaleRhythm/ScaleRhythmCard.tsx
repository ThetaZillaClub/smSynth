// components/training/curriculum-layout/ScaleRhythm/ScaleRhythmCard.tsx
"use client";
import React, { useMemo, useEffect } from "react";
import type { SessionConfig } from "../../session/types";
import type { ScaleName } from "@/utils/phrase/scales";
import type { NoteValue } from "@/utils/time/tempo";
import Field from "../Field";
import { NOTE_VALUE_OPTIONS, SCALE_OPTIONS } from "../Options"; // <- removed TONIC_OPTIONS import

/* --------------------------------- Types --------------------------------- */
type RangeHint = { lo: string; hi: string; list: string; none: boolean } | null;

/* --------------------------- Reusable UI pieces --------------------------- */
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
      "sixteenth"
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
    cfg.scale ?? ({ tonicPc: 0, name: "major" as ScaleName, maxPerDegree: 2 } as const);

  // Flat-preferred labels
  const PC_LABELS_FLAT = useMemo(
    () => ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"],
    []
  );

  // bring forward defaults + ensure separate rest controls exist
  const rhythmCfg = (cfg.rhythm ?? {
    mode: "random",
    available: ["quarter"],
    restProb: 0.3,
    allowRests: true,
    contentRestProb: 0.3,
    contentAllowRests: true,
    lengthBars: cfg.exerciseBars ?? 2, // legacy fallback
  }) as any;

  // LEGACY BRIDGE: if we still have exerciseBars but rhythm.lengthBars is missing, copy it in once
  useEffect(() => {
    if (cfg.exerciseBars != null && (rhythmCfg.lengthBars == null)) {
      onChange({ rhythm: { ...rhythmCfg, lengthBars: cfg.exerciseBars } as any });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = new Set<NoteValue>(rhythmCfg.available ?? ["quarter"]);

  const SEQ_PATTERN_OPTIONS: { label: string; value: "asc" | "desc" | "asc-desc" | "desc-asc" }[] = [
    { label: "Ascending", value: "asc" },
    { label: "Descending", value: "desc" },
    { label: "Asc → Desc", value: "asc-desc" },
    { label: "Desc → Asc", value: "desc-asc" },
  ];

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
            {Array.from({ length: 12 }, (_, pc) => pc).map((pc) => {
              const disabled = haveRange && !allowedTonicPcs.has(pc);
              return (
                <option
                  key={pc}
                  value={pc}
                  disabled={disabled}
                  title={disabled ? "Out of your range" : ""}
                >
                  {PC_LABELS_FLAT[pc]}
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
        {/* Mode */}
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
                        pattern: rhythmCfg.pattern ?? "asc",
                        available: rhythmCfg.available ?? ["quarter"],
                        restProb: rhythmCfg.restProb ?? 0.3,
                        allowRests: rhythmCfg.allowRests ?? true,
                        contentRestProb: rhythmCfg.contentRestProb ?? 0.3,
                        contentAllowRests: rhythmCfg.contentAllowRests ?? true,
                        lengthBars: rhythmCfg.lengthBars ?? (cfg.exerciseBars ?? 2), // keep for when switching back
                      } as any)
                    : ({
                        mode: "random",
                        available: rhythmCfg.available ?? ["quarter"],
                        restProb: rhythmCfg.restProb ?? 0.3,
                        allowRests: rhythmCfg.allowRests ?? true,
                        contentRestProb: rhythmCfg.contentRestProb ?? 0.3,
                        contentAllowRests: rhythmCfg.contentAllowRests ?? true,
                        lengthBars: rhythmCfg.lengthBars ?? (cfg.exerciseBars ?? 2),
                      } as any),
              });
            }}
          >
            <option value="sequence">Sequence</option>
            <option value="random">Random</option>
          </select>
        </Field>

        {/* Sequence pattern (only for sequence mode) */}
        {rhythmCfg.mode === "sequence" ? (
          <Field label="Sequence pattern">
            <select
              className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
              value={rhythmCfg.pattern ?? "asc"}
              onChange={(e) =>
                onChange({ rhythm: { ...rhythmCfg, pattern: e.target.value as any } })
              }
            >
              {[
                { label: "Ascending", value: "asc" },
                { label: "Descending", value: "desc" },
                { label: "Asc → Desc", value: "asc-desc" },
                { label: "Desc → Asc", value: "desc-asc" },
              ].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}

        {/* Rhythm line rests (blue strip) */}
        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="col-span-1">
            <RestControls
              allowRests={rhythmCfg.allowRests !== false}
              restProb={rhythmCfg.restProb ?? 0.3}
              onAllowChange={(next) => onChange({ rhythm: { ...rhythmCfg, allowRests: next } as any })}
              onProbChange={(next) => onChange({ rhythm: { ...rhythmCfg, restProb: next } as any })}
            />
          </div>

          {/* Phrase (scale) rests */}
          <div className="col-span-1">
            <RestControls
              allowRests={rhythmCfg.contentAllowRests !== false}
              restProb={rhythmCfg.contentRestProb ?? 0.3}
              onAllowChange={(next) =>
                onChange({ rhythm: { ...rhythmCfg, contentAllowRests: next } as any })
              }
              onProbChange={(next) =>
                onChange({ rhythm: { ...rhythmCfg, contentRestProb: next } as any })
              }
            />
          </div>
        </div>
      </div>

      {/* Length (bars) — Random mode only */}
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

      {/* Available note lengths (shared) */}
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
