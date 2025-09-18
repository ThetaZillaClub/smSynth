// components/training/curriculum-layout/AdvancedOverrides/AdvancedOverridesCard.tsx
"use client";
import React from "react";
import Field from "../Field";

export default function AdvancedOverridesCard({
  phraseJson,
  setPhraseJson,
}: {
  phraseJson: string;
  setPhraseJson: (s: string) => void;
}) {
  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Advanced overrides (optional)
      </div>
      <Field label="Custom Phrase (JSON)">
        <textarea
          className="w-full min-h-[140px] rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm font-mono"
          placeholder='{"durationSec": 4, "notes":[{"midi":60,"startSec":0,"durSec":0.5}]}'
          value={phraseJson}
          onChange={(e) => setPhraseJson(e.target.value)}
        />
        <div className="text-xs text-[#6b6b6b] mt-1">
          If provided, the game uses this phrase as-is (ignores generated notes).
        </div>
      </Field>
    </div>
  );
}
