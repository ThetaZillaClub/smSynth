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
import type { ScaleName } from "@/utils/phrase/scales";
import SessionAnalytics from "./analytics/SessionAnalytics";

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
  view?: "piano" | "sheet" | "analytics";
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

  /** 🔑 NEW: mode-aware solfege for piano roll */
  tonicPc?: number;
  scaleName?: ScaleName;

  /** NEW: analytics payload (used when view==="analytics") */
  analytics?: {
    scores: any[];
    snapshots: Array<{ phrase: any; rhythm: any; melodyRhythm: any }>;
    bpm: number;
    den: number;
    tonicPc?: number;
    scaleName?: ScaleName | (string & {});
  };
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

  // NEW
  tonicPc,
  scaleName,

  analytics,
}: Props) {
  // If analytics view, render it directly (left) + always keep the side panel on the right).
  if (view === "analytics") {
    return (
      <div className="w-full h-full min-h-[260px]">
        <div className="w-full h-full flex gap-3">
          {/* LEFT: Analytics */}
          <div className="flex-1 min-w-0 rounded-xl shadow-md">
            <div className="w-full h-full rounded-xl bg-transparent border border-[#dcdcdc] p-3 md:p-4 overflow-hidden">
              <SessionAnalytics
                scores={analytics?.scores ?? []}
                snapshots={analytics?.snapshots ?? []}
                bpm={analytics?.bpm ?? bpm}
                den={analytics?.den ?? den}
                tonicPc={analytics?.tonicPc ?? tonicPc ?? 0}
                scaleName={(analytics?.scaleName ?? scaleName ?? "major") as any}
              />
            </div>
          </div>
          {/* RIGHT: Side panel */}
          <aside className="shrink-0 w-[clamp(260px,20vw,380px)] rounded-xl shadow-md">
            <SidePanelLayout>{stageAside}</SidePanelLayout>
          </aside>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────
  // Regular sheet / piano-stage rendering
  // ───────────────────────────────────────────────────────────────

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
    const el = sheetHostRef.current;
    if (el) {
      const w = el.clientWidth || Math.round(el.getBoundingClientRect().width);
      setSheetW((prev) => (w && w !== prev ? w : prev));
    }
  }, []);

  const hasPhrase = !!(phrase && Array.isArray(phrase.notes) && phrase.notes.length > 0);
  const showRhythm = !!(rhythm && rhythm.length);
  const wantRhythm = hasPhrase && showRhythm && view !== "sheet";

  // Make the rhythm lane EXACTLY one piano-roll row high.
  // Piano roll is 1 octave of rows → 13 cells (inclusive upper line).
  // Solve for main + rhythm + gap = fillH:
  //   main + (main/13) + GAP = fillH  =>  main = (fillH - GAP) * 13/14
  //   rhythm = main/13                =>  rhythm = (fillH - GAP) / 14
  const GAP = 8;
  const ROWS = 13;
  let mainH: number;
  let rhythmH: number;

  if (wantRhythm) {
    const avail = fillH - GAP;
    const mainTarget = Math.round((avail * ROWS) / (ROWS + 1));
    mainH = Math.max(200, mainTarget);
    rhythmH = Math.max(0, avail - mainH); // ensures exact sum + exact single row height
  } else {
    mainH = Math.max(200, fillH);
    rhythmH = 0;
  }

  const useSharpsPref = useMemo(() => preferSharpsForKeySig(keySig || null), [keySig]);

  const leadInSecEff = useMemo(() => {
    if (typeof leadInSec === "number" && isFinite(leadInSec)) return Math.max(0, leadInSec);
    const bars = typeof leadBars === "number" ? leadBars : 1;
    return beatsToSeconds(barsToBeats(bars, tsNum), bpm, den);
  }, [leadInSec, leadBars, tsNum, bpm, den]);

  const renderedPanel = <SidePanelLayout>{stageAside}</SidePanelLayout>;

  const resolvedClef = (clef ?? pickClef(phrase)) as "treble" | "bass";
  const sheetStaffHeight = Math.max(160, Math.floor(mainH * 0.72));

  return (
    <div ref={hostRef} className="w-full h-full min-h-[260px]">
      <div className="w-full h-full flex gap-3">
        {/* LEFT: Main stage area */}
        <div className="flex-1 min-w-0 flex flex-col drop-shadow-sm rounded-xl shadow-md">
          <div className="w-full">
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
                /** 🔑 NEW: rotate solfege labels with the mode */
                solfegeTonicPc={tonicPc}
                solfegeScaleName={scaleName}
              />
            )}
          </div>

          {wantRhythm ? (
            <div className="w-full mt-2">
              <RhythmRollCanvas
                height={rhythmH}
                rhythm={rhythm ?? null}
                running={running}
                startAtMs={startAtMs}
                leadInSec={leadInSecEff}
                bpm={bpm}
                den={den}
                windowSec={WINDOW_SEC}
                anchorRatio={ANCHOR_RATIO}
              />
            </div>
          ) : null}
        </div>

        {/* RIGHT: Vertical panel — ALWAYS visible */}
        <aside className="shrink-0 w-[clamp(260px,20vw,380px)] rounded-xl shadow-md">
          {renderedPanel}
        </aside>
      </div>
    </div>
  );
}
