// components/piano-roll/PianoRollCanvas.tsx
"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import DynamicOverlay from "./DynamicOverlay";
import type { Phrase as PhraseT } from "@/utils/piano-roll/types";

/** Re-export so upstream can import { type Phrase } from this file */
export type Phrase = PhraseT;

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
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Render the canvas only after we have a real measured width
  const [width, setWidth] = useState<number | null>(null);

  // Measure width responsively (sync + RAF + ResizeObserver for robustness)
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth || Math.round(el.getBoundingClientRect().width);
      if (w && w !== width) setWidth(w);
    };

    // Synchronous first read
    measure();
    // One-frame-later read in case flex/layout hasn’t settled
    const raf = requestAnimationFrame(measure);
    // Keep in sync on resizes
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [minMidi, maxMidi] = useMemo<[number, number]>(() => {
    if (!phrase || !phrase.notes.length) return [60 - 6, 60 + 6]; // default around middle C
    let lo = Infinity;
    let hi = -Infinity;
    for (const n of phrase.notes) {
      if (n.midi < lo) lo = n.midi;
      if (n.midi > hi) hi = n.midi;
    }
    // Add a little headroom top/bottom
    lo = Math.floor(lo - 2);
    hi = Math.ceil(hi + 2);
    if (lo >= hi) hi = lo + 1;
    return [lo, hi];
  }, [phrase]);

  // If no phrase, we still reserve vertical space so layout doesn’t jump
  if (!phrase || phrase.notes.length === 0) {
    return <div ref={hostRef} className="relative w-full" style={{ height }} />;
  }

  return (
    <div ref={hostRef} className="relative w-full" style={{ height }}>
      {/* Only render when we have a non-zero width to avoid the 1px “squished” first frame */}
      {width && width > 4 ? (
        <DynamicOverlay
          width={width}
          height={height}
          phrase={phrase}
          running={running}
          onActiveNoteChange={onActiveNoteChange}
          minMidi={minMidi}
          maxMidi={maxMidi}
          windowSec={4}
          anchorRatio={0.1}
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
