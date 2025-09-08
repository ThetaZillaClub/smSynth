"use client";
import React from "react";
import GameHeader from "./GameHeader";
import GameStage from "./GameStage";
import GameStats from "./GameStats";
import GameLyrics from "./GameLyrics";
import PlayControls from "./PlayControls";
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
  title, micText, error,
  running, onToggle,
  phrase,
  lyrics, activeLyricIndex = -1,
  pitchText, noteText, confidence,
  livePitchHz, confThreshold = 0.5,
  children, onActiveNoteChange,
}: LayoutProps) {
  return (
    <main className="min-h-screen flex flex-col bg-[#f0f0f0] text-[#0f0f0f]">
      {/* Header (no start button here) */}
      <div className="w-full flex justify-center pt-6 px-6">
        <div className="w-full max-w-7xl">
          <GameHeader title={title} micText={micText} error={error} />
        </div>
      </div>

      {/* Play controls (only when phrase exists) */}
      {phrase ? (
        <div className="w-full flex justify-center px-6 mt-3">
          <div className="w-full max-w-7xl flex items-center justify-end">
            <PlayControls running={running} onToggle={onToggle} />
          </div>
        </div>
      ) : null}

      {/* Stage */}
      <div className="w-full flex justify-center px-0 md:px-6 mt-3">
        <div className="w-full max-w-7xl">
          <GameStage
            phrase={phrase ?? null}
            running={running}
            onActiveNoteChange={onActiveNoteChange}
            height={320}
            livePitchHz={livePitchHz}
            confidence={confidence}
            confThreshold={confThreshold}
          />
        </div>
      </div>

      {/* Lyrics rail (passed only in play step) */}
      {phrase && lyrics && lyrics.length ? (
        <div className="w-full flex justify-center px-6 mt-4">
          <GameLyrics words={lyrics} activeIndex={activeLyricIndex} />
        </div>
      ) : null}

      {/* Page panel */}
      {children ? (
        <div className="w-full flex justify-center px-6 mt-4">
          <div className="w-full max-w-7xl">{children}</div>
        </div>
      ) : null}

      {/* Bottom stats */}
      <div className="w-full flex justify-center px-6 mt-6 mb-8">
        <div className="w-full max-w-7xl">
          <GameStats pitchText={pitchText} noteText={noteText} confidence={confidence} />
        </div>
      </div>
    </main>
  );
}
