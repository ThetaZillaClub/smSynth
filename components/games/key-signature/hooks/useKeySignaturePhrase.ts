"use client";

import { useMemo } from "react";
import type { Phrase } from "@/utils/stage";
import { buildTwoBarRhythm } from "@/utils/phrase/rhythmBuilders";
import { buildPhraseFromScaleWithRhythm } from "@/utils/phrase/phraseBuilders";

export type UseKeySignaturePhraseArgs = {
  lowHz: number | null;
  highHz: number | null;
  tonicPc: number | null;
  bpm: number;
  tsNum: number;
  den: number;
  bars?: number; // default 3
};

export function useKeySignaturePhrase({
  lowHz,
  highHz,
  tonicPc,
  bpm,
  tsNum,
  den,
  bars = 3,
}: UseKeySignaturePhraseArgs) {
  const phrase: Phrase | null = useMemo(() => {
    if (lowHz == null || highHz == null || tonicPc == null) return null;

    const rhythm = buildTwoBarRhythm({
      bpm,
      den,
      tsNum,
      available: ["quarter"],
      restProb: 0.4,
      allowRests: true,
      seed: Math.floor(Math.random() * 0xffffffff) >>> 0,
      bars,
    });

    return buildPhraseFromScaleWithRhythm({
      lowHz,
      highHz,
      bpm,
      den,
      tonicPc,
      scale: "major",
      rhythm,
      seed: Math.floor(Math.random() * 0xffffffff) >>> 0,
    });
  }, [lowHz, highHz, tonicPc, bpm, tsNum, den, bars]);

  return { phrase };
}

export default useKeySignaturePhrase;
