// components/training/layout/GameLayout.tsx
"use client";
import React from "react";
import GameHeader from "./header/GameHeader";
import GameStage from "./piano-roll/GameStage";
import GameStats from "./stats/GameStats";
import GameLyrics from "./lyrics/GameLyrics";
import useActiveLyricIndex from "./lyrics/useActiveLyricIndex";
import { type Phrase } from "./piano-roll/PianoRollCanvas";
import type { LoopPhase } from "../../../hooks/gameplay/usePracticeLoop";
import type { RhythmEvent } from "@/utils/phrase/generator";

type LayoutProps = {
  title: string;
  error?: string | null;

  /** Drives the stage/recorder only */
  running: boolean;
  onToggle: () => void;

  phrase?: Phrase | null;

  lyrics?: string[];

  /** Live analysis */
  livePitchHz?: number | null;
  confidence: number;
  confThreshold?: number;

  /** Recorder anchor in ms since epoch/performance time; keeps overlay in sync with audio engine */
  startAtMs?: number | null;

  /** Lead-in seconds shown in the overlay prior to first note (default 1.5) */
  leadInSec?: number;

  /** UI-only “running” flag used for the header label; lets us show Pause during rest */
  uiRunning?: boolean;

  /** Inputs for header/stats readouts */
  isReady?: boolean;

  /** Step/loop are used by internal lyric highlighting */
  step: "low" | "high" | "play";
  loopPhase: LoopPhase;

  /** rhythm fabric (to render a syncopation line) + tempo */
  rhythm?: RhythmEvent[];
  /** authoritative rhythm for the melody durations */
  melodyRhythm?: RhythmEvent[];
  bpm?: number;
  den?: number;
  tsNum?: number;

  /** VexFlow key signature (e.g., "Bb", "F#", "C"). */
  keySig?: string | null;

  /** session view */
  view?: "piano" | "sheet";

  /** Melody clef + range (for overlay & readout normalization) */
  clef?: "treble" | "bass" | null;
  lowHz?: number | null;
  highHz?: number | null;

  children?: React.ReactNode;
};

export default function GameLayout({
  title,
  error,
  running,
  onToggle,
  phrase,
  lyrics,

  livePitchHz,
  confidence,
  confThreshold = 0.5,
  startAtMs = null,
  leadInSec = 1.5,
  uiRunning,

  isReady = false,

  step,
  loopPhase,

  rhythm,
  melodyRhythm,
  bpm = 80,
  den = 4,
  tsNum = 4,

  keySig = null,

  view = "piano",

  clef = null,
  lowHz = null,
  highHz = null,

  children,
}: LayoutProps) {
  const showPlay = !!phrase;

  const { activeIndex, setActiveIndex } = useActiveLyricIndex({ step, loopPhase });

  return (
    <main className="min-h-dvh h-dvh flex flex-col bg-[#f0f0f0] text-[#0f0f0f]">
      {/* Header */}
      <div className="w-full flex justify-center pt-4 px-6 pb-2">
        <div className="w-full max-w-7xl">
          <GameHeader
            title={title}
            showPlay={showPlay}
            running={uiRunning ?? running}
            onToggle={onToggle}
            livePitchHz={livePitchHz}
            isReady={isReady}
            error={error}
          />
        </div>
      </div>

      {/* BODY fills remaining height */}
      {!showPlay ? (
        /* ---- CAPTURE MODE ---- */
        <div className="w-full flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 flex items-center justify-center px-6 mt-2">
            <div className="w-full max-w-7xl">{children}</div>
          </div>

          <div className="w-full flex justify-center px-6 pb-4">
            <div className="w-full max-w-7xl">
              <GameStats
                livePitchHz={livePitchHz}
                isReady={isReady}
                error={error}
                confidence={confidence}
                confThreshold={confThreshold}
                keySig={keySig}
                clef={clef}
                lowHz={lowHz}
                highHz={highHz}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ---- PLAY MODE ---- */
        <div className="w-full flex-1 flex flex-col gap-4 min-h-0 pb-4">
          {/* Stage */}
          <div className="w-full flex-1 min-h-0 px-0 md:px-6 mt-2">
            <GameStage
              phrase={phrase ?? null}
              running={running}
              onActiveNoteChange={setActiveIndex}
              livePitchHz={livePitchHz}
              confidence={confidence}
              confThreshold={confThreshold}
              startAtMs={startAtMs}
              lyrics={lyrics}
              leadInSec={leadInSec}
              /* rhythm line & tempo */
              rhythm={rhythm}
              melodyRhythm={melodyRhythm}
              bpm={bpm}
              den={den}
              tsNum={tsNum}
              keySig={keySig}
              /* view mode */
              view={view}
              /* melody context */
              lowHz={lowHz}
              highHz={highHz}
            />
          </div>

          {phrase && lyrics && lyrics.length ? (
            <div className="w-full flex justify-center px-6">
              <div className="w-full max-w-7xl">
                <GameLyrics words={lyrics} activeIndex={activeIndex} />
              </div>
            </div>
          ) : null}

          {children ? (
            <div className="w-full flex justify-center px-6">
              <div className="w-full max-w-7xl">{children}</div>
            </div>
          ) : null}

          <div className="w-full flex justify-center px-6">
            <div className="w-full max-w-7xl">
              <GameStats
                livePitchHz={livePitchHz}
                isReady={isReady}
                error={error}
                confidence={confidence}
                confThreshold={confThreshold}
                keySig={keySig}
                clef={clef}
                lowHz={lowHz}
                highHz={highHz}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
