// components/training/layout/piano-roll/GameStage.tsx
"use client";
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import PianoRollCanvas, { type Phrase } from "@/components/training/layout/piano-roll/PianoRollCanvas";
import RhythmRollCanvas from "@/components/training/layout/piano-roll/RhythmRollCanvas";
import type { RhythmEvent } from "@/utils/phrase/generator";
import VexScore from "@/components/training/layout/sheet/VexScore";
import SheetOverlay from "@/components/training/layout/sheet/SheetOverlay";

type SystemLayout = { startSec: number; endSec: number; x0: number; x1: number; y0: number; y1: number };

type Props = {
  phrase?: Phrase | null;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;
  height?: number;
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
  startAtMs?: number | null;
  lyrics?: string[];
  leadInSec?: number;
  /** Blue rhythm line (independent of melody) */
  rhythm?: RhythmEvent[];
  /** Authoritative durations for MELODY only (independent of blue rhythm line) */
  melodyRhythm?: RhythmEvent[];
  bpm?: number;
  den?: number;
  tsNum?: number;
  view?: "piano" | "sheet";
};

function pickClef(phrase: Phrase | null | undefined): "treble" | "bass" {
  const ns = phrase?.notes ?? [];
  if (!ns.length) return "treble";
  let below = 0;
  for (const n of ns) if (n.midi < 60) below++;
  return below > ns.length / 2 ? "bass" : "treble";
}

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
  melodyRhythm,
  bpm = 80,
  den = 4,
  tsNum = 4,
  view = "piano",
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [fillH, setFillH] = useState<number>(height ?? 360);

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

  const [sheetW, setSheetW] = useState<number | null>(null);
  const [layoutBand, setLayoutBand] = useState<{ start: number; end: number } | null>(null);
  const [systems, setSystems] = useState<SystemLayout[] | null>(null);

  const sheetHostRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (view !== "sheet") return;
    const el = sheetHostRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || Math.round(el.getBoundingClientRect().width);
      if (w && w !== sheetW) setSheetW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, sheetW]);

  // Accept both old single-band and new multi-system payloads
  const handleLayout = useCallback((m: any) => {
    if (m && Array.isArray(m.systems)) {
      setSystems(m.systems as SystemLayout[]);
      const first = m.systems[0];
      if (first) {
        setLayoutBand((prev) => {
          const next = { start: first.x0, end: first.x1 };
          if (prev && Math.abs(prev.start - next.start) < 0.5 && Math.abs(prev.end - next.end) < 0.5) return prev;
          return next;
        });
      }
    } else if (m && typeof m.noteStartX === "number" && typeof m.noteEndX === "number") {
      setLayoutBand((prev) => {
        if (prev && Math.abs(prev.start - m.noteStartX) < 0.5 && Math.abs(prev.end - m.noteEndX) < 0.5) return prev;
        return { start: m.noteStartX, end: m.noteEndX };
      });
      setSystems(null);
    }
  }, []);

  const showRhythm = !!(rhythm && rhythm.length);
  const rhythmH = 72;
  const mainH = Math.max(200, fillH - (view !== "sheet" && showRhythm ? rhythmH + 8 : 0));

  if (!phrase || !Array.isArray(phrase.notes) || phrase.notes.length === 0) {
    return <div ref={hostRef} className="w-full h-full min-h-[260px]" />;
  }

  const clef = pickClef(phrase);
  const sheetStaffHeight = Math.max(160, Math.floor(mainH * 0.72));

  return (
    <div ref={hostRef} className="w-full h-full min-h-[260px]">
      <div className="w-full">
        {view === "sheet" ? (
          <div className="w-full" style={{ height: mainH }}>
            <div
              ref={sheetHostRef}
              className="relative w-full"
              style={{ height: sheetStaffHeight }}
            >
              <VexScore
                phrase={phrase}
                lyrics={lyrics ?? undefined}
                bpm={bpm}
                den={den}
                tsNum={tsNum}
                leadInSec={leadInSec}
                clef={clef}
                onLayout={handleLayout}
                rhythm={rhythm}
                melodyRhythm={melodyRhythm}
              />
              {sheetW && sheetW > 4 ? (
                <SheetOverlay
                  width={sheetW}
                  height={sheetStaffHeight}
                  phrase={phrase}
                  running={running}
                  startAtMs={startAtMs}
                  leadInSec={leadInSec}
                  bpm={bpm}
                  tsNum={tsNum}
                  den={den}
                  livePitchHz={livePitchHz}
                  confidence={confidence}
                  confThreshold={confThreshold}
                  a4Hz={440}
                  staffStartX={layoutBand?.start ?? undefined}
                  staffEndX={layoutBand?.end ?? undefined}
                  /** NEW: multi-row layout for precise playhead */
                  systems={systems ?? undefined}
                />
              ) : null}
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {showRhythm && view !== "sheet" ? (
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
