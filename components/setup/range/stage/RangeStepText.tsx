// components/setup/range/stage/RangeStepText.tsx
"use client";

import React from "react";

export default function RangeStepText({
  step,
  holdSec = 1,
  section = "top",
}: {
  step: "low" | "high";
  holdSec?: number;
  /** "top" renders the headline only; "bottom" renders the smaller copy moved under the polar stage */
  section?: "top" | "bottom";
}) {
  const headline =
    step === "low"
      ? "Sing your lowest comfortable note"
      : "Sing your highest comfortable note";

  const secLabel =
    Number(holdSec) === 1 ? "1 second" : `${Number(holdSec)} seconds`;

  if (section === "top") {
    return (
      <div className="w-full flex flex-col items-center text-center mb-3 md:mb-5 select-none px-2">
        {/* Headline: 18px → fluid → 30px */}
        <div className="font-semibold text-[#0f0f0f] leading-tight text-[clamp(1.125rem,2.8vw,1.875rem)]">
          {headline}
        </div>
      </div>
    );
  }

  // section === "bottom" (smaller text placed beneath the polar stage, full width like footer)
  return (
    <div className="w-full select-none text-center px-2">
      {/* Target line: 12px → fluid → 16px */}
      <div className="text-[#2d2d2d] text-[clamp(0.75rem,1.6vw,1rem)]">
        Target: <span className="font-medium">{secLabel}</span>
      </div>
      {/* Hint: 11px → fluid → ~14.4px; allow wider line-length to avoid awkward wrap without spilling */}
      <div className="mt-1 text-[#4b5563] text-[clamp(0.688rem,1.4vw,0.9rem)] mx-auto max-w-[110ch]">
        Click <span className="font-semibold">Play</span> to start capturing. You can warm up first.
        Your live note shows above even while paused.
      </div>
    </div>
  );
}
