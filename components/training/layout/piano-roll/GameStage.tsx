// components/training/layout/piano-roll/GameStage.tsx
"use client";
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import PianoRollCanvas, { type Phrase } from "@/components/training/layout/piano-roll/PianoRollCanvas";
import RhythmRollCanvas from "@/components/training/layout/piano-roll/RhythmRollCanvas";
import type { RhythmEvent } from "@/utils/phrase/generator";
import VexScore from "@/components/training/layout/sheet/VexScore";
import SheetOverlay from "@/components/training/layout/sheet/SheetOverlay";

type Props = {
  phrase?: Phrase | null;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;

  /** If provided, use this fixed height; otherwise fill parent height */
  height?: number;

  /** Live pitch */
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;

  /** Recorder anchor in ms; used to align overlay time with audio engine */
  startAtMs?: number | null;

  /** Lyric words aligned 1:1 with phrase.notes (optional) */
  lyrics?: string[];

  /** Lead-in seconds shown in the overlay prior to first note (default 1.5) */
  leadInSec?: number;

  /** Rhythm line events (now rendered as a connected lower staff in sheet view) */
  rhythm?: RhythmEvent[];

  /** tempo & meter */
  bpm?: number;
  den?: number;
  tsNum?: number;

  /** session view mode */
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
  bpm = 80,
  den = 4,
  tsNum = 4,
  view = "piano",
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [fillH, setFillH] = useState<number>(height ?? 360);

  // measure parent height if no fixed height is passed
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

  // measure width for sheet container (so overlay canvas perfectly covers VexScore)
  const [sheetW, setSheetW] = useState<number | null>(null);
  const [layoutBand, setLayoutBand] = useState<{ start: number; end: number } | null>(null);
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

  // Guarded setter to avoid infinite update loops (only update when changed)
  const handleLayout = useCallback((m: { noteStartX: number; noteEndX: number }) => {
    setLayoutBand((prev) => {
      if (prev && Math.abs(prev.start - m.noteStartX) < 0.5 && Math.abs(prev.end - m.noteEndX) < 0.5) {
        return prev; // no change -> no re-render
      }
      return { start: m.noteStartX, end: m.noteEndX };
    });
  }, []);

  // layout: reserve extra height for the blue rhythm strip ONLY in piano view
  const showRhythm = !!(rhythm && rhythm.length);
  const rhythmH = 72;
  const mainH = Math.max(200, fillH - (view !== "sheet" && showRhythm ? rhythmH + 8 : 0)); // gap when strip shown

  // Reserve space even if no phrase to avoid layout jumps
  if (!phrase || !Array.isArray(phrase.notes) || phrase.notes.length === 0) {
    return <div ref={hostRef} className="w-full h-full min-h-[260px]" />;
  }

  const clef = pickClef(phrase);
  const sheetStaffHeight = Math.max(160, Math.floor(mainH * 0.72)); // a bit taller since VexScore now has 2 staves when rhythm is present

  return (
    <div ref={hostRef} className="w-full h-full min-h-[260px]">
      <div className="w-full">
        {view === "sheet" ? (
          <div className="w-full" style={{ height: mainH }}>
            {/* Engraved connected staves (melody + rhythm) with overlay host */}
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
                rhythm={rhythm} // ⬅️ rhythm is now engraved as a connected lower staff
              />

              {/* ONLY the moving green playhead & live pitch dot */}
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

      {/* In PIANO view, keep the legacy blue rhythm strip under the roll */}
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
