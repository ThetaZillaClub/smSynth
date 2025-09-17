"use client";

import React from "react";
import PlayControls from "./PlayControls";
import usePitchReadout from "@/hooks/pitch/usePitchReadout";

type Props = {
  title: string;

  /** Show Start/Pause in the header (only when a phrase exists) */
  showPlay?: boolean;
  running?: boolean;
  onToggle?: () => void;

  // readout inputs (colocated here)
  livePitchHz?: number | null;
  isReady?: boolean;
  error?: string | null;
};

export default function GameHeader({
  title,
  showPlay = false,
  running = false,
  onToggle,
  livePitchHz,
  isReady = false,
  error,
}: Props) {
  const { micText } = usePitchReadout({
    pitch: typeof livePitchHz === "number" ? livePitchHz : null,
    isReady,
    error,
    a4Hz: 440,
  });

  return (
    <div className="w-full max-w-7xl flex items-center justify-between gap-4 flex-wrap">
      <h1 className="text-3xl font-semibold">{title}</h1>

      <div className="flex items-center gap-3">
        <div className={`text-sm ${error ? "text-red-600" : "text-[#2d2d2d]"}`}>
          {error ? `Mic error: ${String(error)}` : micText}
        </div>

        {showPlay && onToggle ? <PlayControls running={running} onToggle={onToggle} /> : null}
      </div>
    </div>
  );
}
