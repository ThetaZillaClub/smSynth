"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hzToMidi, midiToHz, midiToNoteName } from "@/utils/pitch/pitchMath";

export type UsePitchTimeRootArgs = {
  lowHz: number | null;
  highHz: number | null;
  engaged: boolean;
  preload?: boolean; // preload a root before Start (default true)
};

export function usePitchTimeRoot({
  lowHz,
  highHz,
  engaged,
  preload = true,
}: UsePitchTimeRootArgs) {
  const [rootMidi, setRootMidi] = useState<number | null>(null);

  // Choose a root inside range near the mid, but bounded so the 5th fits.
  const pickRoot = useCallback(() => {
    if (lowHz == null || highHz == null) return null;
    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
    const mid = Math.round((loM + hiM) / 2);
    // keep within [loM, hiM-7] so P5 is inside range
    return Math.min(hiM - 7, Math.max(loM, mid + (Math.floor(Math.random() * 7) - 3)));
  }, [lowHz, highHz]);

  // Preload root before Start for early staff render
  useEffect(() => {
    if (!preload) return;
    if (!engaged && rootMidi == null && lowHz != null && highHz != null) {
      const r = pickRoot();
      if (r != null) setRootMidi(r);
    }
  }, [preload, engaged, rootMidi, lowHz, highHz, pickRoot]);

  const rootHz = useMemo(() => (rootMidi != null ? midiToHz(rootMidi, 440) : null), [rootMidi]);
  const rootLabel = useMemo(() => {
    if (rootMidi == null) return "—";
    const n = midiToNoteName(rootMidi, { useSharps: true });
    return `${n.name}${n.octave}`;
  }, [rootMidi]);

  return { rootMidi, setRootMidi, pickRoot, rootHz, rootLabel };
}

export default usePitchTimeRoot;
