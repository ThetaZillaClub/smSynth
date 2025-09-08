"use client";
import React from "react";
import PianoRollCanvas, { type Phrase } from "@/components/piano-roll/PianoRollCanvas";

type Props = {
  phrase?: Phrase | null;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;
  height?: number;
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
};

export default function GameStage({
  phrase,
  running,
  onActiveNoteChange,
  height = 280,
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
}: Props) {
  if (!phrase || !Array.isArray(phrase.notes) || phrase.notes.length === 0) {
    return <div style={{ height }} className="w-full" />;
  }

  return (
    <div className="w-full">
      <PianoRollCanvas
        height={height}
        phrase={phrase}
        running={running}
        onActiveNoteChange={onActiveNoteChange}
        livePitchHz={livePitchHz}
        confidence={confidence}
        confThreshold={confThreshold}
        leadInSec={1.5}   // ← pre-roll before first note hits the anchor
      />
    </div>
  );
}
