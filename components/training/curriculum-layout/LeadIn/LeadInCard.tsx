// components\training\curriculum-layout\LeadIn\LeadInCard.tsx
"use client";
import React from "react";
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
export default function LeadInCard({
  cfg,
  onChange,
}: {
  cfg: SessionConfig;
  onChange: (patch: Partial<SessionConfig>) => void;
}) {
  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Lead In & Call/Response</div>
      <Field label="Metronome">
        <FancyCheckbox
          checked={cfg.metronome ?? true}
          onChange={(next) => onChange({ metronome: next })}
          label={(cfg.metronome ?? true) ? "On" : "Off"}
        />
      </Field>
      <Field label="Call/Response">
        <FancyCheckbox
          checked={cfg.callResponse ?? true}
          onChange={(next) => onChange({ callResponse: next })}
          label={(cfg.callResponse ?? true) ? "On" : "Off"}
        />
      </Field>
      <Field label="Advanced Mode">
        <FancyCheckbox
          checked={cfg.advancedMode ?? false}
          onChange={(next) => onChange({ advancedMode: next })}
          label={(cfg.advancedMode ?? false) ? "On" : "Off"}
        />
      </Field>
    </div>
  );
}