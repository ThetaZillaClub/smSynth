// components/training/curriculum-layout/ViewSelect/ViewSelectCard.tsx
"use client";

import React from "react";
import type { SessionConfig } from "@/components/training/session/types";

export default function ViewSelectCard({
  value,
  onChange,
}: {
  value: SessionConfig["view"];
  onChange: (patch: Partial<SessionConfig>) => void;
}) {
  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-white p-3">
      <div className="text-sm font-semibold mb-2">View</div>
      <div className="flex gap-2">
        {([
          { key: "piano", label: "Piano Roll" },
          { key: "sheet", label: "Sheet Music" },
        ] as const).map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange({ view: opt.key })}
              className={
                active
                  ? "px-3 py-1.5 rounded-md text-sm bg-[#0f0f0f] text-white"
                  : "px-3 py-1.5 rounded-md text-sm bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2] hover:bg-white"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[#2d2d2d] mt-2">
        Choose how the exercise is displayed during the session.
      </p>
    </div>
  );
}
