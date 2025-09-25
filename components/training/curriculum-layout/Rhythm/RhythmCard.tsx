// components/training/curriculum-layout/Rhythm/RhythmCard.tsx
"use client";
import React, { useMemo } from "react";
import type { SessionConfig } from "../../session/types";
import Field from "../Field";

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

export default function RhythmCard({
  cfg,
  onChange,
}: {
  cfg: SessionConfig;
  onChange: (patch: Partial<SessionConfig>) => void;
}) {
  // This card controls the blue “rhythm line” only (not the melody content rhythm).
  // TrainingGame reads these via (rhythm as any).lineEnabled / allowRests / restProb.
  const rhythmCfg = useMemo(
    () =>
      (cfg.rhythm ?? {
        lineEnabled: true,
        allowRests: true,
        restProb: 0.3,
      }) as any,
    [cfg.rhythm]
  );

  const lineEnabled: boolean = rhythmCfg.lineEnabled !== false;

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Rhythm Line
      </div>

      <Field label="Rhythm line">
        <FancyCheckbox
          checked={lineEnabled}
          onChange={(next) =>
            onChange({ rhythm: { ...rhythmCfg, lineEnabled: next } as any })
          }
          label={<span>{lineEnabled ? "Shown" : "Hidden"}</span>}
        />
      </Field>

      {lineEnabled ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <RestControls
            allowRests={rhythmCfg.allowRests !== false}
            restProb={rhythmCfg.restProb ?? 0.3}
            onAllowChange={(next) =>
              onChange({ rhythm: { ...rhythmCfg, allowRests: next } as any })
            }
            onProbChange={(next) =>
              onChange({ rhythm: { ...rhythmCfg, restProb: next } as any })
            }
          />
        </div>
      ) : null}
    </div>
  );
}
