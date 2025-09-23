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

function RestControls({
  allowRests,
  restProb,
  onAllowChange,
  onProbChange,
  label = "Phrase rests",
}: {
  allowRests: boolean;
  restProb: number;
  onAllowChange: (next: boolean) => void;
  onProbChange: (next: number) => void;
  label?: string;
}) {
  return (
    <>
      <Field label={label}>
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

export default function ScaleCard({
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

  const PC_LABELS_FLAT = useMemo(
    () => ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"],
    []
  );

  const rhythmCfg = (cfg.rhythm ?? {
    contentRestProb: 0.3,
    contentAllowRests: true,
  }) as any;

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Scale</div>

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
            onChange={(e) =>
              onChange({ scale: { ...scaleCfg, name: e.target.value as ScaleName } })
            }
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

      {/* Phrase (content) rests */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
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
  );
}
