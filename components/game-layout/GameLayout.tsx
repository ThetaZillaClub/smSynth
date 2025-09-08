"use client";
import React from "react";
import GameHeader from "./GameHeader";
import GameStage from "./GameStage";
import GameStats from "./GameStats";
import GameLyrics from "./GameLyrics";
import { type Phrase } from "@/components/piano-roll/PianoRollCanvas";

type LayoutProps = {
  title: string;
  micText: string;
  error?: string | null;

  running: boolean;
  onToggle: () => void;

  phrase?: Phrase | null;

  lyrics?: string[];
  activeLyricIndex?: number;

  pitchText: string;
  noteText: string;
  confidence: number;

  livePitchHz?: number | null;
  confThreshold?: number;

  children?: React.ReactNode;
  onActiveNoteChange?: (idx: number) => void;
};

export default function GameLayout({
  title,
  micText,
  error,
  running,
  onToggle,
  phrase,
  lyrics,
  activeLyricIndex = -1,
  pitchText,
  noteText,
  confidence,
  livePitchHz,
  confThreshold = 0.5,
  children,
  onActiveNoteChange,
}: LayoutProps) {
  const showPlay = !!phrase;

  return (
    <main className="min-h-dvh h-dvh flex flex-col bg-[#f0f0f0] text-[#0f0f0f]">
      {/* Header */}
      <div className="w-full flex justify-center pt-4 px-6 pb-2">
        <div className="w-full max-w-7xl">
          <GameHeader
            title={title}
            micText={micText}
            error={error}
            showPlay={showPlay}
            running={running}
            onToggle={onToggle}
          />
        </div>
      </div>

      {/* BODY fills remaining height */}
      {!showPlay ? (
        /* ---- CAPTURE MODE (no phrase): center Range Finder vertically, stats at bottom ---- */
        <div className="w-full flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 flex items-center justify-center px-6 mt-2">
            <div className="w-full max-w-7xl">{children}</div>
          </div>

          <div className="w-full flex justify-center px-6 pb-4">
            <div className="w-full max-w-7xl">
              <GameStats
                pitchText={pitchText}
                noteText={noteText}
                confidence={confidence}
                confThreshold={confThreshold}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ---- PLAY MODE (phrase exists): full-width stage, then optional lyrics/children, stats at bottom ---- */
        <div className="w-full flex-1 flex flex-col gap-4 min-h-0 pb-4">
          {/* Full-width stage with a little space below the header */}
          <div className="w-full flex-1 min-h-0 px-0 md:px-6 mt-2">
            <GameStage
              phrase={phrase ?? null}
              running={running}
              onActiveNoteChange={onActiveNoteChange}
              livePitchHz={livePitchHz}
              confidence={confidence}
              confThreshold={confThreshold}
            />
          </div>

          {phrase && lyrics && lyrics.length ? (
            <div className="w-full flex justify-center px-6">
              <div className="w-full max-w-7xl">
                <GameLyrics words={lyrics} activeIndex={activeLyricIndex} />
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
                pitchText={pitchText}
                noteText={noteText}
                confidence={confidence}
                confThreshold={confThreshold}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
