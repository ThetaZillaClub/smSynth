// hooks/pitch/usePitchReadout.ts
"use client";

import { useMemo } from "react";
import { hzToNoteName } from "@/utils/pitch/pitchMath";

type Options = {
  pitch: number | null | undefined;
  isReady: boolean;
  error: unknown;
  a4Hz?: number; // default 440
};

type ReturnShape = {
  micText: string;
  pitchText: string;
  noteText: string;
  micReady: boolean;
};

export default function usePitchReadout({
  pitch,
  isReady,
  error,
  a4Hz = 440,
}: Options): ReturnShape {
  const micText = useMemo(() => {
    return error ? `Mic error: ${String(error)}` : isReady ? "Mic ready" : "Starting mic…";
  }, [error, isReady]);

  const pitchText = useMemo(() => {
    return typeof pitch === "number" ? `${pitch.toFixed(1)} Hz` : "—";
  }, [pitch]);

  const noteText = useMemo(() => {
    if (typeof pitch !== "number") return "—";
    const { name, octave, cents } = hzToNoteName(pitch, a4Hz, {
      useSharps: true,
      octaveAnchor: "C",
    });
    const sign = cents > 0 ? "+" : "";
    return `${name}${octave} ${sign}${cents}¢`;
  }, [pitch, a4Hz]);

  const micReady = isReady && !error;

  return { micText, pitchText, noteText, micReady };
}
