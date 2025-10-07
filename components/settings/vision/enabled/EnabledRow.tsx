// components/settings/vision/enabled/EnabledRow.tsx
"use client";
import * as React from "react";
import { useVisionEnabled } from "../vision-layout";

export default function EnabledRow() {
  const { enabled, setEnabled } = useVisionEnabled();

  const segBase = "px-3 py-1.5 text-sm transition";
  const selected = "bg-[#fdfdfd] active:bg-[#fcfcfc] font-medium";
  const idle = "bg-[#f2f2f2] hover:bg-[#f6f6f6] active:bg-[#f6f6f6]";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">Vision Detection</span>
      <div className="inline-flex rounded-md overflow-hidden border border-[#dcdcdc]">
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className={[segBase, enabled ? idle : selected].join(" ")}
          aria-pressed={!enabled}
        >
          Disabled
        </button>
        <button
          type="button"
          onClick={() => setEnabled(true)}
          className={[segBase, "border-l border-[#dcdcdc]", enabled ? selected : idle].join(" ")}
          aria-pressed={enabled}
        >
          Enabled
        </button>
      </div>
    </div>
  );
}
