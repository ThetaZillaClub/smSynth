"use client";

import { useMemo } from "react";
import type { Phrase } from "@/utils/stage";

export function usePitchTimePhrase({
  rootMidi,
  bpm,
}: {
  rootMidi: number | null;
  bpm: number;
}) {
  const quarterSec = 60 / bpm;

  // do–mi–sol–mi–do
  const seqMidis = useMemo(() => {
    if (rootMidi == null) return [];
    return [rootMidi, rootMidi + 4, rootMidi + 7, rootMidi + 4, rootMidi];
  }, [rootMidi]);

  const phrase: Phrase | null = useMemo(() => {
    if (seqMidis.length === 0) return null;
    const notes = seqMidis.map((m, i) => ({
      midi: m,
      startSec: i * quarterSec,
      durSec: quarterSec,
    }));
    return { durationSec: notes.length * quarterSec, notes };
  }, [seqMidis, quarterSec]);

  return { phrase, seqMidis, quarterSec };
}

export default usePitchTimePhrase;
