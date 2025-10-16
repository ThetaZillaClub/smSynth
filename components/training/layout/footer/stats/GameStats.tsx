// components/training/layout/footer/stats/GameStats.tsx
"use client";
import React from "react";
import usePitchReadout from "@/hooks/pitch/usePitchReadout";

type ItemProps = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  intent?: "default" | "error";
  className?: string;
};
function StatItem({ label, value, mono, intent = "default", className }: ItemProps) {
  const labelClasses = intent === "error" ? "text-red-600" : "text-[#2d2d2d]";
  const valueClasses = intent === "error" ? "text-red-700" : "text-[#0f0f0f]";
  return (
    <div className={`flex flex-col items-start leading-none ${className ?? ""}`}>
      {/* labels only on lg+ to reduce height earlier */}
      <div className={`hidden lg:block text-[11px] lg:text-xs ${labelClasses}`}>{label}</div>
      <div
        className={`text-base md:text-lg leading-tight ${mono ? "font-mono" : ""} ${valueClasses} whitespace-nowrap tabular-nums`}
      >
        {value}
      </div>
    </div>
  );
}

type Props = {
  livePitchHz?: number | null;
  isReady?: boolean;
  error?: string | null;

  confidence: number;     // kept for prop compatibility; not shown
  confThreshold?: number; // kept for prop compatibility; not shown

  keySig?: string | null;
  clef?: "treble" | "bass" | null;
  lowHz?: number | null;
  highHz?: number | null;

  className?: string;
};

export default function GameStats({
  livePitchHz,
  isReady = false,
  error,
  // confidence, confThreshold — intentionally unused (labels removed)
  keySig = null,
  clef = null,
  lowHz = null,
  highHz = null,
  className,
}: Props) {
  const { noteText } = usePitchReadout({
    pitch: typeof livePitchHz === "number" ? livePitchHz : null,
    isReady,
    error,
    a4Hz: 440,
    keySig,
    clef,
    lowHz,
    highHz,
  });

  return (
    <div className={`min-w-0 flex-none ${className ?? ""}`}>
      {/* keep this compact and stable so SessionPanel can consume space */}
      <div className="flex items-center justify-end flex-nowrap gap-x-4 md:gap-x-5">
        <StatItem className="w-[7rem] flex-none" label="Note" value={noteText} mono />
      </div>
    </div>
  );
}
