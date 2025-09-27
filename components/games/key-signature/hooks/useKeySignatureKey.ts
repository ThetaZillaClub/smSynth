"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hzToMidi, midiToHz } from "@/utils/pitch/pitchMath";
import { keyNameFromTonicPc } from "@/components/training/layout/stage/sheet/vexscore/builders";

export type UseKeySignatureKeyArgs = {
  lowHz: number | null;
  highHz: number | null;
  engaged: boolean;
  preload?: boolean; // preload a key before Start (default true)
};

export function useKeySignatureKey({
  lowHz,
  highHz,
  engaged,
  preload = true,
}: UseKeySignatureKeyArgs) {
  const [tonicPc, setTonicPc] = useState<number | null>(null);
  const [tonicMidi, setTonicMidi] = useState<number | null>(null);

  const chooseRandomKey = useCallback((): { pc: number | null; m: number | null } => {
    if (lowHz == null || highHz == null) return { pc: null, m: null };
    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));

    // only allow key centers we can place over ≥ 1 octave for context
    const allowed = new Set<number>();
    for (let m = loM; m <= hiM - 12; m++) allowed.add(((m % 12) + 12) % 12);

    const pcs = Array.from(allowed);
    if (!pcs.length) return { pc: null, m: null };

    const pc = pcs[Math.floor(Math.random() * pcs.length)];

    let tonic: number | null = null;
    for (let m = loM; m <= hiM; m++) {
      if ((((m % 12) + 12) % 12) === pc) {
        tonic = m;
        break;
      }
    }
    return { pc, m: tonic };
  }, [lowHz, highHz]);

  // Preload a key before Start so the staff renders early
  useEffect(() => {
    if (!preload) return;
    if (!engaged && tonicPc == null && lowHz != null && highHz != null) {
      const { pc, m } = chooseRandomKey();
      setTonicPc(pc);
      setTonicMidi(m);
    }
  }, [preload, engaged, tonicPc, lowHz, highHz, chooseRandomKey]);

  const keyName = useMemo(
    () => (tonicPc != null ? keyNameFromTonicPc(tonicPc, "major", false) : null),
    [tonicPc]
  );

  const targetHz = useMemo(
    () => (tonicMidi != null ? midiToHz(tonicMidi, 440) : null),
    [tonicMidi]
  );

  return {
    tonicPc,
    tonicMidi,
    setTonicPc,
    setTonicMidi,
    keyName,
    targetHz,
    chooseRandomKey,
  };
}

export default useKeySignatureKey;
