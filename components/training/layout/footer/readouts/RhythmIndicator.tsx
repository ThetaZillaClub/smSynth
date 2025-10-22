"use client";

import React from "react";

export default function RhythmIndicator({
  active = false,
  disabled = false,
  label = "Rhythm",
  className,
}: {
  active?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const on = active && !disabled;

  return (
    <div className={`min-w-0 flex-none ${className ?? ""}`}>
      {/* Fixed width to mirror PitchReadout */}
      <div className="w-[7rem] flex-none">
        {/* Center the label text */}
        <div
          className={[
            "hidden lg:block text-[11px] lg:text-xs select-none leading-none text-center",
            disabled ? "text-zinc-400" : "text-[#2d2d2d]",
          ].join(" ")}
        >
          {label}
        </div>

        {/* Center the toggle directly under the label */}
        <div className="mt-1 flex justify-center">
          <div
            aria-label={label}
            aria-live="polite"
            aria-disabled={disabled || undefined}
            className={[
              "w-6 h-6 md:w-7 md:h-7 rounded-lg border transition-shadow duration-150",
              disabled
                ? "opacity-40 bg-white/30 border-white/40 backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : on
                ? "bg-green-500 border-green-500 ring-2 ring-green-500 shadow-[0_4px_12px_rgba(34,197,94,0.25)]"
                : "bg-white/30 border-white/40 backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.10)]",
            ].join(" ")}
          />
        </div>
      </div>
    </div>
  );
}
