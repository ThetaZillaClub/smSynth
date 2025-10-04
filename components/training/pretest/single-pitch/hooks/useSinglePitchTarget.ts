"use client";

import { useMemo } from "react";
import { hzToMidi, midiToHz, midiToNoteName } from "@/utils/pitch/pitchMath";

/**
 * Picks the tonic as the *low tonic root from range*.
 * We scan upward from lowHz until we hit tonicPc.
 */
export default function useSinglePitchTarget({
  lowHz,
  tonicPc,
}: {
  lowHz: number | null;
  tonicPc: number;
}) {
  const tonicMidi = useMemo(() => {
    if (lowHz == null) return null;
    const lowM = Math.round(hzToMidi(lowHz));
    const wantPc = ((tonicPc % 12) + 12) % 12;
    for (let m = lowM; m < lowM + 36; m++) {
      if ((((m % 12) + 12) % 12) === wantPc) return m;
    }
    return null;
  }, [lowHz, tonicPc]);

  const tonicHz = useMemo(
    () => (tonicMidi != null ? midiToHz(tonicMidi, 440) : null),
    [tonicMidi]
  );

  const tonicLabel = useMemo(() => {
    if (tonicMidi == null) return "—";
    const n = midiToNoteName(tonicMidi, { useSharps: true });
    return `${n.name}${n.octave}`;
  }, [tonicMidi]);

  return { tonicMidi, tonicHz, tonicLabel };
}
