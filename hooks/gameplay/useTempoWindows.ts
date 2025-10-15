"use client";
import { useMemo } from "react";
import {
  secondsPerBeat,
  beatsToSeconds,
  barsToBeats,
  noteValueToBeats,
  type NoteValue,
} from "@/utils/time/tempo";
import type { Phrase } from "@/utils/stage";

export function useTempoWindows({
  bpm,
  tsNum,
  tsDen,
  leadBars,
  restBars,
  noteValue,
  noteDurSec,
  phrase,
  fallbackPhraseSecOverride,
}: {
  bpm: number;
  tsNum: number;
  tsDen: number;
  leadBars: number;
  restBars: number;
  noteValue?: NoteValue | string | null;
  noteDurSec?: number | null;
  phrase: Phrase | null;
  /** If provided, use this total phrase length (seconds) instead of deriving from notes/gen length. */
  fallbackPhraseSecOverride?: number | null;
}) {
  const secPerBeat = useMemo(() => secondsPerBeat(bpm, tsDen), [bpm, tsDen]);

  const leadInSec = useMemo(
    () => beatsToSeconds(barsToBeats(leadBars, tsNum), bpm, tsDen),
    [leadBars, tsNum, bpm, tsDen]
  );

  const restSec = useMemo(
    () => beatsToSeconds(barsToBeats(restBars, tsNum), bpm, tsDen),
    [restBars, tsNum, bpm, tsDen]
  );

  const genNoteDurSec = useMemo(() => {
    if (typeof noteValue === "string") {
      // Function expects NoteValue; cast safely
      return beatsToSeconds(noteValueToBeats(noteValue as NoteValue, tsDen), bpm, tsDen);
    }
    return (noteDurSec ?? secPerBeat);
  }, [noteValue, noteDurSec, secPerBeat, bpm, tsDen]);

  const phraseSec = useMemo(() => {
    const fallbackPhraseSec = (fallbackPhraseSecOverride ?? (genNoteDurSec * 8));
    if (!phrase?.notes?.length) return fallbackPhraseSec;
    return phrase.durationSec ?? fallbackPhraseSec;
  }, [phrase, genNoteDurSec, fallbackPhraseSecOverride]);

  const recordWindowSec = useMemo(() => {
    const tsLen = tsNum * secPerBeat;
    const lastEnd = phrase?.notes?.reduce((mx, n) => Math.max(mx, n.startSec + n.durSec), 0) ?? phraseSec;
    return Math.ceil(lastEnd / Math.max(1e-9, tsLen)) * tsLen;
  }, [phrase, phraseSec, tsNum, secPerBeat]);

  return { secPerBeat, leadInSec, restSec, recordWindowSec };
}
