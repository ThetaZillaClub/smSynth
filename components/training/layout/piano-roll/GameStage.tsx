// components/training/layout/piano-roll/GameStage.tsx
"use client";
import React, { useLayoutEffect, useRef, useState } from "react";
import PianoRollCanvas, { type Phrase } from "@/components/training/layout/piano-roll/PianoRollCanvas";
import RhythmRollCanvas from "@/components/training/layout/piano-roll/RhythmRollCanvas";
import type { RhythmEvent } from "@/utils/phrase/generator";

type Props = {
  phrase?: Phrase | null;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;
  /** If provided, use this fixed height; otherwise fill parent height */
  height?: number;
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;

  /** Recorder anchor in ms; used to align overlay time with audio engine */
  startAtMs?: number | null;

  /** Lyric words aligned 1:1 with phrase.notes (optional) */
  lyrics?: string[];

  /** Lead-in seconds shown in the overlay prior to first note (default 1.5) */
  leadInSec?: number;

  /** NEW: rhythm line events (renders in blue below the piano roll) */
  rhythm?: RhythmEvent[];

  /** tempo for rhythm layout */
  bpm?: number;
  den?: number;
};

export default function GameStage({
  phrase,
  running,
  onActiveNoteChange,
  height,
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
  startAtMs = null,
  lyrics,
  leadInSec = 1.5,
  rhythm,
  bpm = 80,
  den = 4,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [fillH, setFillH] = useState<number>(height ?? 360);

  // Measure parent height if no fixed height is passed
  useLayoutEffect(() => {
    if (typeof height === "number") {
      setFillH(height);
      return;
    }
    const el = hostRef.current;
    if (!el) return;

    const measure = () => setFillH(Math.max(260, el.clientHeight || 0));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  // layout: main piano roll + rhythm strip under
  const rhythmH = rhythm && rhythm.length ? 72 : 0; // show only if we have rhythm
  const mainH = Math.max(200, fillH - (rhythmH ? rhythmH + 8 : 0)); // gap between

  // Reserve space even if no phrase to avoid layout jumps
  if (!phrase || !Array.isArray(phrase.notes) || phrase.notes.length === 0) {
    return (
      <div ref={hostRef} className="w-full h-full min-h-[260px]" />
    );
  }

  return (
    <div ref={hostRef} className="w-full h-full min-h-[260px]">
      <div className="w-full">
        <PianoRollCanvas
          height={mainH}
          phrase={phrase}
          running={running}
          onActiveNoteChange={onActiveNoteChange}
          livePitchHz={livePitchHz}
          confidence={confidence}
          confThreshold={confThreshold}
          leadInSec={leadInSec}
          startAtMs={startAtMs}
          lyrics={lyrics}
        />
      </div>

      {rhythm && rhythm.length ? (
        <div className="w-full mt-2 px-0">
          <RhythmRollCanvas
            height={rhythmH}
            rhythm={rhythm}
            running={running}
            startAtMs={startAtMs}
            leadInSec={leadInSec}
            bpm={bpm}
            den={den}
          />
        </div>
      ) : null}
    </div>
  );
}
