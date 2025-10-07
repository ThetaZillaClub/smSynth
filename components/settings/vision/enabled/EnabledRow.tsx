// components/settings/vision/enabled/EnabledRow.tsx
"use client";
import * as React from "react";
import { useVisionDraft } from "../vision-layout";

export default function EnabledRow() {
  const { draft, setDraft } = useVisionDraft();

  const segBase = "px-3 py-1.5 text-sm transition";
  const selected = "bg-[#fdfdfd] active:bg-[#fcfcfc] font-medium";
  const idle = "bg-[#f2f2f2] hover:bg-[#f6f6f6] active:bg-[#f6f6f6]";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">Vision Detection</span>
      <div className="inline-flex rounded-md overflow-hidden border border-[#dcdcdc]">
        <button
          type="button"
          onClick={() => setDraft({ enabled: false })}
          className={[segBase, draft.enabled ? idle : selected].join(" ")}
        >
          Disabled
        </button>
        <button
          type="button"
          onClick={() => setDraft({ enabled: true })}
          className={[segBase, "border-l border-[#dcdcdc]", draft.enabled ? selected : idle].join(" ")}
        >
          Enabled
        </button>
      </div>
    </div>
  );
}
