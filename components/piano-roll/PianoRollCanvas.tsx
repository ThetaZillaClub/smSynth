"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getMidiRange, PR_COLORS } from "./scale";
import DynamicOverlay from "./DynamicOverlay";
import type { Phrase as PhraseT, Note as NoteT } from "./types";

export type Note = NoteT;
export type Phrase = PhraseT;

type Props = {
  height?: number;
  phrase: Phrase;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;

  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;

  leadInSec?: number;   // new: delay before first note arrives
  a4Hz?: number;        // optional, default 440
};

export default function PianoRollCanvas({
  height = 280,
  phrase,
  running,
  onActiveNoteChange,
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
  leadInSec = 1.5,
  a4Hz = 440,
}: Props) {
  const { minMidi, maxMidi } = useMemo(() => getMidiRange(phrase, 2), [phrase]);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 800));
    ro.observe(el);
    setWidth(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height,
        position: "relative",
        display: "block",
        borderRadius: 10,
        boxShadow: "0 2px 12px rgba(0,0,0,.12)",
        overflow: "hidden",
        background: PR_COLORS.bg,
      }}
    >
      <DynamicOverlay
        width={width}
        height={height}
        phrase={phrase}
        running={running}
        minMidi={minMidi}
        maxMidi={maxMidi}
        onActiveNoteChange={onActiveNoteChange}
        windowSec={4}
        anchorRatio={0.10}
        // live pitch line + preroll
        livePitchHz={livePitchHz}
        confidence={confidence}
        confThreshold={confThreshold}
        leadInSec={leadInSec}
        a4Hz={a4Hz}
      />
    </div>
  );
}
