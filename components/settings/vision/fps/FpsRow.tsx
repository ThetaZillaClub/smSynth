// components/settings/vision/fps/FpsRow.tsx
"use client";
import * as React from "react";
import { useVisionDraft } from "../vision-layout";

export default function FpsRow() {
  const { draft, setDraft } = useVisionDraft();

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">FPS</span>

      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <span className="text-xs text-[#6b6b6b] w-10 text-left select-none">5</span>

        <input
          type="range"
          min={5}
          max={60}
          step={1}
          value={draft.fps}
          onChange={(e) => setDraft({ fps: Number(e.target.value) })}
          aria-label="Vision FPS"
          className="w-full h-2 rounded-lg appearance-none bg-[#dcdcdc] accent-black cursor-pointer"
        />

        <span className="text-xs text-[#6b6b6b] w-10 text-right select-none">60</span>
      </div>

      <div className="text-sm text-[#0f0f0f] w-[120px] text-right">
        <span className="font-medium">{draft.fps}</span>
        <span className="ml-1 text-[#6b6b6b]">fps</span>
      </div>
    </div>
  );
}
