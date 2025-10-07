// components/settings/vision/resolution/ResolutionRow.tsx
"use client";

import * as React from "react";
import { useVisionDraft, type DetectionResolution } from "../vision-layout";

export default function ResolutionRow() {
  const { draft, setDraft } = useVisionDraft();

  const segBase = "px-4 py-2 text-sm transition select-none";
  const selected = "bg-[#fdfdfd] active:bg-[#fcfcfc] font-medium";
  const idle = "bg-[#f2f2f2] hover:bg-[#f6f6f6] active:bg-[#f6f6f6]";

  const Chip: React.FC<{ value: DetectionResolution; label: string }> = ({
    value,
    label,
  }) => {
    const isSel = draft.resolution === value;
    return (
      <button
        type="button"
        aria-pressed={isSel}
        onClick={() => setDraft({ resolution: value })}
        className={[segBase, isSel ? selected : idle, "min-w-[132px] text-center"].join(" ")}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">Detection Resolution</span>
      <div className="inline-flex rounded-md overflow-hidden border border-[#dcdcdc]">
        <Chip value="medium" label="Medium" />
        <div className="w-px bg-[#dcdcdc]" aria-hidden />
        <Chip value="high" label="High" />
      </div>
    </div>
  );
}
