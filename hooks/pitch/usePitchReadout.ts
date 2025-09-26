// hooks/pitch/usePitchReadout.ts
"use client";

import { useMemo, useRef } from "react";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";

function preferSharpsForKeySig(keySig?: string | null): boolean {
  // Bias toward FLATS when neutral or ambiguous (e.g., "C")
  if (!keySig) return false;

  const k = String(keySig).trim();

  // Symbol-first for robustness ("Bb", "F#", etc.)
  if (k.includes("b")) return false;
  if (k.includes("#")) return true;

  // Named major keys (normalized; "C" intentionally treated as neutral → flats)
  const FLAT_KEYS  = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]);
  const SHARP_KEYS = new Set(["G", "D", "A", "E", "B", "F#", "C#"]);

  if (FLAT_KEYS.has(k)) return false;
  if (SHARP_KEYS.has(k)) return true;

  // Neutral/unknown → prefer flats
  return false;
}

type Options = {
  pitch: number | null | undefined;
  isReady: boolean;
  error: unknown;
  a4Hz?: number;

  /** Context to make readout agree with the sheet */
  keySig?: string | null;
  clef?: "treble" | "bass" | null;

  /** Student range → centers octave normalization like the overlay */
  lowHz?: number | null;
  highHz?: number | null;
};

type ReturnShape = {
  micText: string;
  pitchText: string;
  noteText: string;
  micReady: boolean;
};

function normalizeToCenter(rawMidi: number, centerMidi: number | null): number {
  if (centerMidi == null || !isFinite(centerMidi)) return rawMidi;
  const d0 = Math.abs(rawMidi - centerMidi);
  const dUp = Math.abs((rawMidi + 12) - centerMidi);
  const dDn = Math.abs((rawMidi - 12) - centerMidi);
  if (dUp < d0 && dUp <= dDn) return rawMidi + 12;
  if (dDn < d0 && dDn < dUp) return rawMidi - 12;
  return rawMidi;
}

export default function usePitchReadout({
  pitch,
  isReady,
  error,
  a4Hz = 440,
  keySig = null,
  clef = null,          // reserved for future variant label styles
  lowHz = null,
  highHz = null,
}: Options): ReturnShape {
  const micText = useMemo(() => {
    return error ? `Mic error: ${String(error)}`
                 : isReady ? "Mic ready"
                           : "Starting mic…";
  }, [error, isReady]);

  const pitchText = useMemo(() => {
    return typeof pitch === "number" ? `${pitch.toFixed(1)} Hz` : "—";
  }, [pitch]);

  const centerMidi = useMemo(() => {
    if (typeof lowHz === "number" && typeof highHz === "number" && isFinite(lowHz) && isFinite(highHz)) {
      const lo = hzToMidi(lowHz, a4Hz);
      const hi = hzToMidi(highHz, a4Hz);
      if (isFinite(lo) && isFinite(hi)) return (lo + hi) / 2;
    }
    return null;
  }, [lowHz, highHz, a4Hz]);

  // Semitone hysteresis to prevent label flapping near ±50¢.
  const stableNearestRef = useRef<number | null>(null);

  const noteText = useMemo(() => {
    if (typeof pitch !== "number" || !isFinite(pitch) || pitch <= 0) {
      stableNearestRef.current = null;
      return "—";
    }

    const useSharps = preferSharpsForKeySig(keySig);

    const rawM = hzToMidi(pitch, a4Hz);
    const dispM = rawM;
    const candidate = Math.round(dispM);
    const prev = stableNearestRef.current;
    let nearest = candidate;

    if (prev != null && prev !== candidate) {
      const centsFromPrev = 100 * (dispM - prev);
      if (candidate === prev + 1 && centsFromPrev < +55) nearest = prev;
      else if (candidate === prev - 1 && centsFromPrev > -55) nearest = prev;
    }
    stableNearestRef.current = nearest;

    const cents = Math.round(100 * (dispM - nearest));
    const { name, octave } = midiToNoteName(nearest, {
      useSharps,
      octaveAnchor: "C", // scientific C-anchored; clef does not change pitch class/octave
    });

    const sign = cents > 0 ? "+" : "";
    return `${name}${octave} ${sign}${cents}¢`;
  }, [pitch, a4Hz, centerMidi, keySig]);

  const micReady = isReady && !error;

  return { micText, pitchText, noteText, micReady };
}
