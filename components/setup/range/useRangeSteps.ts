// components/range/useRangeSteps.ts
"use client";

import { useCallback, useMemo, useState } from "react";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";

type Step = "low" | "high" | "play";

type Opts = {
  /** Persist range label when low/high confirmed */
  updateRange: (which: "low" | "high", label: string) => Promise<void> | void;
  a4Hz?: number; // default 440
};

type ReturnShape = {
  step: Step;
  setStep: (s: Step) => void;
  lowHz: number | null;
  highHz: number | null;
  canPlay: boolean;
  confirmLow: (hz: number) => void;
  confirmHigh: (hz: number) => void;
};

export default function useRangeSteps({ updateRange, a4Hz = 440 }: Opts): ReturnShape {
  const [step, setStep] = useState<Step>("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  const canPlay = useMemo(() => lowHz != null && highHz != null, [lowHz, highHz]);

  const snapToEqualTempered = (hz: number) => {
    const m = Math.round(hzToMidi(hz, a4Hz));
    const snappedHz = a4Hz * Math.pow(2, (m - 69) / 12);
    const { name, octave } = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
    return { label: `${name}${octave}`, snappedHz };
  };

  const confirmLow = useCallback(
    (hz: number) => {
      const { label, snappedHz } = snapToEqualTempered(hz);
      setLowHz(snappedHz);           // keep UI in sync with what we save
      void updateRange("low", label);
      setStep("high");
    },
    [a4Hz, updateRange] // a4Hz is stable but include for completeness
  );

  const confirmHigh = useCallback(
    (hz: number) => {
      const { label, snappedHz } = snapToEqualTempered(hz);
      setHighHz(snappedHz);
      void updateRange("high", label);
      setStep("play");
    },
    [a4Hz, updateRange]
  );

  return { step, setStep, lowHz, highHz, canPlay, confirmLow, confirmHigh };
}
