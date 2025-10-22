"use client";

import React from "react";
import Readout from "./Readout";
import usePitchReadout from "@/hooks/pitch/usePitchReadout";

export default function PitchReadout({
  livePitchHz,
  isReady = false,
  error,
  keySig = null,
  clef = null,
  lowHz = null,
  highHz = null,
  className,
}: {
  livePitchHz?: number | null;
  isReady?: boolean;
  error?: string | null;
  keySig?: string | null;
  clef?: "treble" | "bass" | null;
  lowHz?: number | null;
  highHz?: number | null;
  className?: string;
}) {
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
      <div className="flex items-center justify-end flex-nowrap gap-x-4 md:gap-x-5">
        <Readout
          className="w-[7rem] flex-none"
          label="Note"
          value={noteText}
          mono
          align="center"
        />
      </div>
    </div>
  );
}
