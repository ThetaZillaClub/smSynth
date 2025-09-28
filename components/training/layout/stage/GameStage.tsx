// components/training/layout/piano-roll/GameStage.tsx
"use client";
import React, { useCallback, useLayoutEffect, useRef, useState, useMemo } from "react";
import PianoRollCanvas, { type Phrase } from "@/components/training/layout/stage/piano-roll/PianoRollCanvas";
import RhythmRollCanvas from "@/components/training/layout/stage/piano-roll/RhythmRollCanvas";
import type { RhythmEvent } from "@/utils/phrase/generator";
import VexScore from "@/components/training/layout/stage/sheet/VexScore";
import SheetOverlay from "@/components/training/layout/stage/sheet/SheetOverlay";
import type { SystemLayout } from "@/components/training/layout/stage/sheet/vexscore/types";
import { pickClef, preferSharpsForKeySig } from "@/components/training/layout/stage/sheet/vexscore/builders";
import { barsToBeats, beatsToSeconds } from "@/utils/time/tempo";

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
  /** If provided, used directly; otherwise we compute from leadBars/ts/bpm. */
  leadInSec?: number;
  /** Blue rhythm line (independent of melody) */
  rhythm?: RhythmEvent[];
  /** Authoritative durations for MELODY only (independent of blue rhythm line) */
  melodyRhythm?: RhythmEvent[];
  bpm?: number;
  den?: number;
  tsNum?: number;
  /** Optionally provide bars of lead-in (preferred source). */
  leadBars?: number;
  /** NEW: key signature name for the staves (e.g., "G", "Bb", "F#"). */
  keySig?: string | null;
  view?: "piano" | "sheet";
  /** Optional singer range, used for octave normalization in the overlay */
  lowHz?: number | null;
  highHz?: number | null;

  /** MELODY clef to force on the top staff; pass to lock clef selection. */
  clef?: "treble" | "bass" | null;
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
  leadInSec, // may be undefined
  rhythm,
  melodyRhythm,
  bpm = 80,
  den = 4,
  tsNum = 4,
  leadBars, // may be undefined
  keySig = null, // NEW
  view = "piano",
  lowHz = null,
  highHz = null,
  clef = null,
}: Props) {
  // 🔁 unify timeline settings so both canvases compute identical px/sec + anchor
  const WINDOW_SEC = 4;
  const ANCHOR_RATIO = 0.1;

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

  const handleLayout = useCallback((m: { systems: SystemLayout[] }) => {
    setSystems(m.systems ?? null);
  }, []);

  const showRhythm = !!(rhythm && rhythm.length);
  const rhythmH = 72;
  const mainH = Math.max(200, fillH - (view !== "sheet" && showRhythm ? rhythmH + 8 : 0));

  if (!phrase || !Array.isArray(phrase.notes) || phrase.notes.length === 0) {
    return <div ref={hostRef} className="w-full h-full min-h-[260px]" />;
  }

  // Resolve clef: prefer the explicit prop (stable), else fall back to phrase heuristic.
  const resolvedClef = clef ?? pickClef(phrase);

  const sheetStaffHeight = Math.max(160, Math.floor(mainH * 0.72));
  const sheetReady = Boolean(systems && systems.length);

  // Prefer sharps in sharp/neutral keys, flats in flat keys (fewer-accidentals policy).
  const useSharpsPref = useMemo(() => preferSharpsForKeySig(keySig || null), [keySig]);

  // --------- Compute effective lead-in seconds (pass down consistently) ----------
  const leadInSecEff = useMemo(() => {
    if (typeof leadInSec === "number" && isFinite(leadInSec)) return Math.max(0, leadInSec);
    // fallback: compute from leadBars (default 1 bar) and current transport
    const bars = typeof leadBars === "number" ? leadBars : 1;
    return beatsToSeconds(barsToBeats(bars, tsNum), bpm, den);
  }, [leadInSec, leadBars, tsNum, bpm, den]);

  return (
    <div ref={hostRef} className="w-full h-full min-h-[260px]">
      <div className="w-full">
        {view === "sheet" ? (
          <div className="w-full" style={{ height: mainH }}>
            <div
              ref={sheetHostRef}
              className={`relative w-full ${sheetReady ? "opacity-100" : "opacity-0"}`}
              style={{ height: sheetStaffHeight, transition: "opacity 150ms ease-out" }}
            >
              <VexScore
                phrase={phrase}
                lyrics={lyrics ?? undefined}
                bpm={bpm}
                den={den}
                tsNum={tsNum}
                leadInSec={leadInSecEff}
                clef={resolvedClef}
                onLayout={handleLayout}
                rhythm={rhythm}
                melodyRhythm={melodyRhythm}
                keySig={keySig || null}
                useSharps={useSharpsPref}
              />
              {sheetW && sheetW > 4 && sheetReady ? (
                <SheetOverlay
                  width={sheetW}
                  height={sheetStaffHeight}
                  phrase={phrase}
                  running={running}
                  startAtMs={startAtMs}
                  leadInSec={leadInSecEff}
                  livePitchHz={livePitchHz}
                  confidence={confidence}
                  confThreshold={confThreshold}
                  a4Hz={440}
                  systems={systems!}
                  clef={resolvedClef}
                  lowHz={lowHz}
                  highHz={highHz}
                  useSharps={useSharpsPref}
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
            leadInSec={leadInSecEff}
            startAtMs={startAtMs}
            lyrics={lyrics}
            /** keep in lockstep with rhythm roll */
            windowSec={WINDOW_SEC}
            anchorRatio={ANCHOR_RATIO}
          />
        )}
      </div>

      {showRhythm && view !== "sheet" ? (
        <div className="w-full mt-2">
          <RhythmRollCanvas
            height={rhythmH}
            rhythm={rhythm}
            running={running}
            startAtMs={startAtMs}
            leadInSec={leadInSecEff}
            bpm={bpm}
            den={den}
            /** keep in lockstep with piano roll */
            windowSec={WINDOW_SEC}
            anchorRatio={ANCHOR_RATIO}
          />
        </div>
      ) : null}
    </div>
  );
}
