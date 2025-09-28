// components/training/layout/stage/piano-roll/PianoRollCanvas.tsx
"use client";
import React, { useMemo } from "react";
import DynamicOverlay from "./DynamicOverlay";
import { getMidiRange, type Phrase } from "@/utils/stage";
import useMeasuredWidth from "./roll/hooks/useMeasuredWidth";

/** Re-export so upstream can import { type Phrase } from this file */
export type { Phrase };

type Props = {
  height: number;
  phrase: Phrase | null;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
  leadInSec?: number;
  startAtMs?: number | null;
  lyrics?: string[];
  windowSec?: number;
  anchorRatio?: number;
  keySig?: string | null;

  /** Visual toggles (pass-through to DynamicOverlay) */
  showNoteBlocks?: boolean;    // default true
  showNoteBorders?: boolean;   // default true
  blocksWhenLyrics?: boolean;  // default false (so text-only when lyrics exist)
};

export default function PianoRollCanvas({
  height,
  phrase,
  running,
  onActiveNoteChange,
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
  leadInSec = 1.5,
  startAtMs = null,
  lyrics,
  windowSec = 4,
  anchorRatio = 0.1,
  keySig = null,
  showNoteBlocks = true,
  showNoteBorders = true,
  blocksWhenLyrics = true,
}: Props) {
  const { hostRef, width } = useMeasuredWidth();

  // --- keySig -> tonic pitch class (0..11) ---
  const tonicPc = useMemo(() => {
    const s = (keySig ?? "C")
      .trim()
      .replace(/\s+/g, "")
      .replace(/minor|maj(or)?|min|m$/i, "")
      .replace("♯", "#")
      .replace("♭", "b")
      .toUpperCase();

    const MAP: Record<string, number> = {
      C: 0, "B#": 0,
      "C#": 1, DB: 1,
      D: 2,
      "D#": 3, EB: 3,
      E: 4, "FB": 4,
      F: 5, "E#": 5,
      "F#": 6, GB: 6,
      G: 7,
      "G#": 8, AB: 8,
      A: 9,
      "A#": 10, BB: 10,
      B: 11, CB: 11,
    };
    return MAP[s] ?? 0;
  }, [keySig]);

  // --- Enharmonic preference: flats-first policy ---
  const useSharps = useMemo(() => {
    const s = (keySig ?? "C")
      .trim()
      .replace(/\s+/g, "")
      .replace(/minor|maj(or)?|min|m$/i, "")
      .replace("♯", "#")
      .replace("♭", "b")
      .toUpperCase();
    const SHARP_KEYS = new Set<string>(["G", "D", "A", "E", "B", "F#", "C#"]);
    return SHARP_KEYS.has(s);
  }, [keySig]);

  const [minMidi, maxMidi] = useMemo<[number, number]>(() => {
    const fallbackCenter = 60; // middle C
    if (!phrase || !phrase.notes.length) {
      const oct = Math.floor((fallbackCenter - tonicPc) / 12);
      const min = oct * 12 + tonicPc;
      return [min, min + 13]; // duplicate upper tonic
    }
    const { minMidi: minP, maxMidi: maxP } = getMidiRange(phrase, 2);
    const center = Math.round((minP + maxP) / 2);
    let baseOct = Math.floor((center - tonicPc) / 12);
    let min = baseOct * 12 + tonicPc;
    let max = min + 13;

    if (minP >= max) { min += 12; max += 12; }
    if (maxP < min)  { min -= 12; max -= 12; }

    return [min, max];
  }, [phrase, tonicPc]);

  if (!phrase || phrase.notes.length === 0) {
    return <div ref={hostRef} className="relative w-full" style={{ height }} />;
  }

  return (
    <div ref={hostRef} className="relative w-full" style={{ height }}>
      {width && width > 4 ? (
        <DynamicOverlay
          width={width}
          height={height}
          phrase={phrase}
          running={running}
          onActiveNoteChange={onActiveNoteChange}
          minMidi={minMidi}
          maxMidi={maxMidi}
          windowSec={windowSec}
          anchorRatio={anchorRatio}
          livePitchHz={livePitchHz}
          confidence={confidence}
          confThreshold={confThreshold}
          a4Hz={440}
          leadInSec={leadInSec}
          startAtMs={startAtMs}
          lyrics={lyrics}
          tonicPc={tonicPc}
          useSharps={useSharps}
          showNoteBlocks={showNoteBlocks}
          showNoteBorders={showNoteBorders}
          blocksWhenLyrics={blocksWhenLyrics}
        />
      ) : null}
    </div>
  );
}
