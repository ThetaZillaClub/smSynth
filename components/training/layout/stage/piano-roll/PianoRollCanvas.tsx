// components/training/layout/stage/piano-roll/PianoRollCanvas.tsx
"use client";
import React, { useMemo } from "react";
import DynamicOverlay from "./DynamicOverlay";
import { getMidiRange, type Phrase } from "@/utils/stage";
import useMeasuredWidth from "./roll/hooks/useMeasuredWidth";

/** Re-export so upstream can import { type Phrase } from this file */
export type { Phrase };

type Props = {
  /** Fixed height in CSS pixels (wrapper provides this). */
  height: number;
  phrase: Phrase | null;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
  leadInSec?: number;
  startAtMs?: number | null;
  /** Lyric words aligned 1:1 with phrase.notes (optional) */
  lyrics?: string[];
  /** Shared timeline settings so it matches RhythmRoll exactly */
  windowSec?: number;      // default 4
  anchorRatio?: number;    // default 0.1
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
}: Props) {
  const { hostRef, width } = useMeasuredWidth();

  const [minMidi, maxMidi] = useMemo<[number, number]>(() => {
    if (!phrase || !phrase.notes.length) return [60 - 6, 60 + 6]; // default around middle C
    const { minMidi: minP, maxMidi: maxP } = getMidiRange(phrase, 2);
    let min = minP;
    let max = maxP;
    const range = max - min;
    if (range < 12) {
      const center = Math.round((min + max) / 2);
      min = center - 6;
      max = center + 6;
    }
    if (min >= max) return [min, min + 1];
    return [min, max];
  }, [phrase]);

  // If no phrase, still reserve height so layout doesn’t jump
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
        />
      ) : null}
    </div>
  );
}
