"use client";

import { useMemo } from "react";
import type { Phrase } from "@/utils/stage";

export function usePitchTunePhrase({
  targetMidi,
  requiredHoldSec,
}: {
  targetMidi: number | null;
  requiredHoldSec: number;
}) {
  const phrase: Phrase | null = useMemo(() => {
    if (targetMidi == null) return null;
    return {
      durationSec: requiredHoldSec,
      notes: [{ midi: targetMidi, startSec: 0, durSec: requiredHoldSec }],
    };
  }, [targetMidi, requiredHoldSec]);

  return { phrase };
}

export default usePitchTunePhrase;
