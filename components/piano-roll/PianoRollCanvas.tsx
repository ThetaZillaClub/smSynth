"use client";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
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

  /** delay before first note arrives */
  leadInSec?: number;
  /** tuning reference */
  a4Hz?: number;

  /** Recorder anchor in ms; keeps overlay in sync with capture engine */
  startAtMs?: number | null;
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
  startAtMs = null,
}: Props) {
  const { minMidi, maxMidi } = useMemo(() => getMidiRange(phrase, 2), [phrase]);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null); // start unknown to avoid an early, wrong-sized draw

  // Measure immediately after mount, then track with RO
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    // initial measure
    setWidth(el.clientWidth || 0);

    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth || 0);
    });
    ro.observe(el);
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
      {/* Don't draw the overlay until we have a real width to prevent oval artefacts */}
      {width != null && width > 0 && (
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
          startAtMs={startAtMs}
        />
      )}
    </div>
  );
}
