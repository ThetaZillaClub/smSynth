"use client";
import React, { useLayoutEffect, useRef, useState } from "react";
import PianoRollCanvas, { type Phrase } from "@/components/piano-roll/PianoRollCanvas";

type Props = {
  phrase?: Phrase | null;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;
  /** If provided, use this fixed height; otherwise fill parent height */
  height?: number;
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
};

export default function GameStage({
  phrase,
  running,
  onActiveNoteChange,
  height,
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [fillH, setFillH] = useState<number>(height ?? 320);

  // Measure parent height if no fixed height is passed
  useLayoutEffect(() => {
    if (typeof height === "number") {
      setFillH(height);
      return;
    }
    const el = hostRef.current;
    if (!el) return;

    const measure = () => setFillH(Math.max(200, el.clientHeight || 0));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  if (!phrase || !Array.isArray(phrase.notes) || phrase.notes.length === 0) {
    // Reserve space so layout stays stable
    return <div ref={hostRef} className="w-full h-full min-h-[200px]" />;
  }

  return (
    <div ref={hostRef} className="w-full h-full min-h-[200px]">
      <PianoRollCanvas
        height={fillH}
        phrase={phrase}
        running={running}
        onActiveNoteChange={onActiveNoteChange}
        livePitchHz={livePitchHz}
        confidence={confidence}
        confThreshold={confThreshold}
        leadInSec={1.5}
      />
    </div>
  );
}
