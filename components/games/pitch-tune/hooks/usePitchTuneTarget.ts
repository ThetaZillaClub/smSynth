"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hzToMidi, midiToHz, midiToNoteName } from "@/utils/pitch/pitchMath";

export function usePitchTuneTarget({
  lowHz,
  highHz,
  engaged,
  preload = true,
}: {
  lowHz: number | null;
  highHz: number | null;
  engaged: boolean;
  preload?: boolean;
}) {
  const [targetMidi, setTargetMidi] = useState<number | null>(null);

  const pickRandomTarget = useCallback(() => {
    if (lowHz == null || highHz == null) return null;
    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
    if (hiM < loM) return loM;
    const span = Math.max(1, hiM - loM + 1);
    return loM + Math.floor(Math.random() * span);
  }, [lowHz, highHz]);

  // Preload a target before Start for early stage render
  useEffect(() => {
    if (!preload) return;
    if (!engaged && targetMidi == null && lowHz != null && highHz != null) {
      const t = pickRandomTarget();
      if (t != null) setTargetMidi(t);
    }
  }, [preload, engaged, targetMidi, lowHz, highHz, pickRandomTarget]);

  const targetHz = useMemo(
    () => (targetMidi != null ? midiToHz(targetMidi, 440) : null),
    [targetMidi]
  );

  const targetLabel = useMemo(() => {
    if (targetMidi == null) return "—";
    const n = midiToNoteName(targetMidi, { useSharps: true });
    return `${n.name}${n.octave}`;
  }, [targetMidi]);

  return { targetMidi, setTargetMidi, pickRandomTarget, targetHz, targetLabel };
}

export default usePitchTuneTarget;
