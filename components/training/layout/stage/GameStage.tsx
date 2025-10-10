// components/training/layout/stage/GameStage.tsx
"use client";

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import PianoRollCanvas, { type Phrase } from "./piano-roll/PianoRollCanvas";
import RhythmRollCanvas from "./piano-roll/RhythmRollCanvas";
import type { RhythmEvent } from "@/utils/phrase/generator";
import VexScore from "./sheet/vexscore/VexScore";
import SheetOverlay from "./sheet/SheetOverlay";
import type { SystemLayout } from "./sheet/vexscore/types";
import { pickClef, preferSharpsForKeySig } from "./sheet/vexscore/builders";
import { barsToBeats, beatsToSeconds } from "@/utils/time/tempo";
import SidePanelLayout from "./side-panel/SidePanelLayout";

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
  rhythm?: RhythmEvent[];
  melodyRhythm?: RhythmEvent[];
  bpm?: number;
  den?: number;
  tsNum?: number;
  leadBars?: number;
  keySig?: string | null;
  view?: "piano" | "sheet";
  lowHz?: number | null;
  highHz?: number | null;
  clef?: "treble" | "bass" | null;

  /** Visual toggles for piano-roll rectangles */
  showNoteBlocks?: boolean;
  showNoteBorders?: boolean;
  blocksWhenLyrics?: boolean;

  /** Right-side vertical panel content (e.g., Pretest / TakeReview). */
  stageAside?: React.ReactNode;

  /** accepted but unused (kept for compatibility with parent) */
  step?: "low" | "high" | "play";
  loopPhase?: unknown;
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
  leadInSec,
  rhythm,
  melodyRhythm,
  bpm = 80,
  den = 4,
  tsNum = 4,
  leadBars,
  keySig = null,
  view = "piano",
  lowHz = null,
  highHz = null,
  clef = null,

  showNoteBlocks = true,
  showNoteBorders = true,
  blocksWhenLyrics = true,

  stageAside,
}: Props) {
  // Keep timeline math identical across canvases
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

    const measure = () => {
      const next = Math.max(260, el.clientHeight || 0);
      setFillH((prev) => (prev !== next ? next : prev));
    };

    measure();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [height]);

  // Sheet sizing + systems
  const sheetHostRef = useRef<HTMLDivElement | null>(null);
  const [sheetW, setSheetW] = useState<number>(0);
  const [systems, setSystems] = useState<SystemLayout[] | null>(null);

  // ✅ Fix: do not depend on `sheetHostRef.current`
  // Re-run when the sheet view is active (mount/switch), and manage the observer from there.
  useLayoutEffect(() => {
    if (view !== "sheet") return;

    const el = sheetHostRef.current;
    if (!el) return;

    let raf = 0;
    const read = () => {
      const w = el.clientWidth || Math.round(el.getBoundingClientRect().width);
      setSheetW((prev) => (w && w !== prev ? w : prev));
    };

    read();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [view]);

  const handleLayout = useCallback((m: { systems: SystemLayout[] }) => {
    setSystems(m.systems ?? null);
    // After VexScore lays out, width can change from 0 -> real value; refresh sheetW.
    const el = sheetHostRef.current;
    if (el) {
      const w = el.clientWidth || Math.round(el.getBoundingClientRect().width);
      setSheetW((prev) => (w && w !== prev ? w : prev));
    }
  }, []);

  const showRhythm = !!(rhythm && rhythm.length);
  const rhythmH = 72;
  const mainH = Math.max(200, fillH - (view !== "sheet" && showRhythm ? rhythmH + 8 : 0));

  const useSharpsPref = useMemo(() => preferSharpsForKeySig(keySig || null), [keySig]);

  const leadInSecEff = useMemo(() => {
    if (typeof leadInSec === "number" && isFinite(leadInSec)) return Math.max(0, leadInSec);
    const bars = typeof leadBars === "number" ? leadBars : 1;
    return beatsToSeconds(barsToBeats(bars, tsNum), bpm, den);
  }, [leadInSec, leadBars, tsNum, bpm, den]);

  const renderedPanel = <SidePanelLayout>{stageAside}</SidePanelLayout>;

  const hasPhrase = !!(phrase && Array.isArray(phrase.notes) && phrase.notes.length > 0);
  const resolvedClef = (clef ?? pickClef(phrase)) as "treble" | "bass";
  const sheetStaffHeight = Math.max(160, Math.floor(mainH * 0.72));

  return (
    <div ref={hostRef} className="w-full h-full min-h-[260px]">
      <div className="w-full h-full flex gap-3">
        {/* LEFT: Main stage area */}
        <div className="flex-1 min-w-0 flex flex-col drop-shadow-sm shadow-md">
          <div className="w-full">
            {/* If no phrase, render an empty stage area with the correct height */}
            {!hasPhrase ? (
              <div style={{ height: mainH }} />
            ) : view === "sheet" ? (
              <div className="w-full" style={{ height: mainH }}>
                <div
                  ref={sheetHostRef}
                  className="relative w-full"
                  style={{ height: sheetStaffHeight }}
                >
                  <VexScore
                    phrase={phrase!}
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
                  {/* Overlay mounts as soon as we have container dims */}
                  {sheetW > 4 ? (
                    <SheetOverlay
                      width={sheetW}
                      height={sheetStaffHeight}
                      phrase={phrase!}
                      running={running}
                      startAtMs={startAtMs}
                      leadInSec={leadInSecEff}
                      livePitchHz={livePitchHz}
                      confidence={confidence}
                      confThreshold={confThreshold}
                      a4Hz={440}
                      systems={systems ?? undefined}
                      clef={resolvedClef}
                      lowHz={lowHz}
                      highHz={highHz}
                      useSharps={useSharpsPref}
                      bpm={bpm}
                      den={den}
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <PianoRollCanvas
                height={mainH}
                phrase={phrase ?? null}
                running={running}
                onActiveNoteChange={onActiveNoteChange}
                livePitchHz={livePitchHz}
                confidence={confidence}
                confThreshold={confThreshold}
                leadInSec={leadInSecEff}
                startAtMs={startAtMs}
                lyrics={lyrics}
                keySig={keySig}
                /** keep in lockstep with rhythm roll */
                windowSec={WINDOW_SEC}
                anchorRatio={ANCHOR_RATIO}
                /** Visual toggles for rectangles */
                showNoteBlocks={showNoteBlocks}
                showNoteBorders={showNoteBorders}
                blocksWhenLyrics={blocksWhenLyrics}
              />
            )}
          </div>

          {/* Match previous behavior: hide rhythm roll when no phrase */}
          {hasPhrase && showRhythm && view !== "sheet" ? (
            <div className="w-full mt-2">
              <RhythmRollCanvas
                height={rhythmH}
                rhythm={rhythm ?? null}
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

        {/* RIGHT: Vertical panel — ALWAYS visible */}
        <aside className="shrink-0 w-[320px] lg:w-[360px] xl:w-[380px] rounded-xl shadow-md">
          {renderedPanel}
        </aside>
      </div>
    </div>
  );
}
