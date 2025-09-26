// components/training/curriculum-layout/Scale/ScaleCard.tsx
"use client";
import React, { useMemo } from "react";
import type { SessionConfig } from "../../session/types";
import type { ScaleName } from "@/utils/phrase/scales";
import Field from "../Field";
import { SCALE_OPTIONS } from "../Options";

type RangeHint = { lo: string; hi: string; list: string; none: boolean } | null;

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

export default function ScaleCard({
  cfg,
  onChange,
  allowedTonicPcs,
  rangeHint,
  availableRandomOctaveCount,
}: {
  cfg: SessionConfig;
  onChange: (patch: Partial<SessionConfig>) => void;
  allowedTonicPcs: Set<number>;
  rangeHint: RangeHint;
  availableRandomOctaveCount: number;
}) {
  const haveRange = useMemo(
    () => allowedTonicPcs.size > 0 || rangeHint != null,
    [allowedTonicPcs, rangeHint]
  );

  const scaleCfg =
    cfg.scale ??
    ({ tonicPc: 0, name: "major" as ScaleName, maxPerDegree: 2, randomTonic: false } as const);

  const PC_LABELS_FLAT = useMemo(
    () => ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
    []
  );

  // —— Rhythm content (melody) rest controls — read from cfg.rhythm
  const rhythmCfg = useMemo(() => (cfg.rhythm ?? {}) as any, [cfg.rhythm]);
  const contentAllowRests: boolean = rhythmCfg.contentAllowRests !== false;
  const contentRestProb: number = rhythmCfg.contentRestProb ?? 0.3;

  // ——— Random-key preferred octaves (MULTI-SELECT) ———
  const selectedOctIdx = useMemo(() => {
    const raw = cfg.preferredOctaveIndices ?? [1];
    const clean = Array.from(new Set(raw.map((i) => Math.max(0, Math.floor(i)))));
    if (!availableRandomOctaveCount) return [];
    return clean.filter((i) => i < availableRandomOctaveCount);
  }, [cfg.preferredOctaveIndices, availableRandomOctaveCount]);

  const canPickRandomOctaves = !!scaleCfg.randomTonic && availableRandomOctaveCount > 0;

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Scale</div>

      {rangeHint ? (
        <div className="mb-2 text-xs text-[#2d2d2d]">
          Vocal range: <span className="font-semibold">{rangeHint.lo}–{rangeHint.hi}</span>.{" "}
          {rangeHint.none ? (
            <span className="text-red-600">
              Your saved range is narrower than an octave; no keys fully fit.
            </span>
          ) : (
            <>
              Available keys: <span className="font-semibold">{rangeHint.list}</span>.
            </>
          )}
        </div>
      ) : (
        <div className="mb-2 text-xs text-[#6b6b6b]">
          Select a key (will be limited once a vocal range is saved).
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Random key (in range)">
          <FancyCheckbox
            checked={!!scaleCfg.randomTonic}
            onChange={(next) => onChange({ scale: { ...scaleCfg, randomTonic: next } as any })}
            label={<span>{scaleCfg.randomTonic ? "On" : "Off"}</span>}
          />
        </Field>

        <Field label="Tonic">
          <select
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            value={scaleCfg.tonicPc}
            disabled={!!scaleCfg.randomTonic}
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
                <option key={pc} value={pc} disabled={disabled} title={disabled ? "Out of your range" : ""}>
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

        {/* Melody/content rest controls (added back) */}
        <Field label="Melody: allow rests">
          <FancyCheckbox
            checked={contentAllowRests}
            onChange={(next) => onChange({ rhythm: { ...rhythmCfg, contentAllowRests: next } as any })}
            label={<span>{contentAllowRests ? "Enabled" : "Disabled"}</span>}
          />
        </Field>

        <Field label="Melody: rest probability">
          <input
            type="number"
            inputMode="decimal"
            className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
            min={0}
            max={0.95}
            step={0.05}
            value={contentAllowRests ? contentRestProb : 0}
            disabled={!contentAllowRests}
            onChange={(e) =>
              onChange({
                rhythm: {
                  ...rhythmCfg,
                  contentRestProb: Math.max(0, Math.min(0.95, Number(e.target.value) || 0)),
                } as any,
              })
            }
          />
        </Field>

        {/* Preferred octaves (multi-select) */}
        <Field label="Preferred octaves (random key)">
          <div className="flex flex-wrap items-center gap-2">
            {availableRandomOctaveCount > 0 ? (
              Array.from({ length: availableRandomOctaveCount }, (_, i) => i).map((i) => {
                const active = canPickRandomOctaves && selectedOctIdx.includes(i);
                return (
                  <button
                    key={`rand-oct-${i}`}
                    type="button"
                    disabled={!canPickRandomOctaves}
                    title={`Octave ${i + 1}`}
                    onClick={() => {
                      const set = new Set(selectedOctIdx);
                      if (set.has(i)) set.delete(i);
                      else set.add(i);
                      onChange({ preferredOctaveIndices: Array.from(set).sort((a, b) => a - b) });
                    }}
                    className={[
                      "inline-flex items-center justify-center w-7 h-7 rounded border text-xs",
                      canPickRandomOctaves
                        ? active
                          ? "bg-white"
                          : "bg-[#f5f5f5] hover:bg-white transition"
                        : "bg-[#eeeeee] opacity-70 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {i + 1}
                  </button>
                );
              })
            ) : (
              <span className="text-xs text-[#6b6b6b]">No octaves available</span>
            )}
          </div>
          {scaleCfg.randomTonic && availableRandomOctaveCount > 0 ? (
            <div className="mt-1 text-[11px] text-[#6b6b6b]">
              We’ll enable the windows for your selected octaves in the chosen random key. If a preferred
              octave doesn’t exist in that key, we’ll fall back to the nearest lower window.
            </div>
          ) : null}
        </Field>
      </div>
    </div>
  );
}
