// components/training/layout/GameLayout.tsx
"use client";
import React from "react";
import GameStage from "./stage/GameStage";
import GameFooter from "./footer/GameFooter";
import { type Phrase } from "./stage/piano-roll/PianoRollCanvas";
import type { LoopPhase } from "../../../hooks/gameplay/usePracticeLoop";
import type { RhythmEvent } from "@/utils/phrase/generator";

type FooterSession = NonNullable<React.ComponentProps<typeof GameFooter>["sessionPanel"]>;

type StageFooterButton = {
  label: string;
  onClick: () => void | Promise<void>;
  title?: string;
  disabled?: boolean;
};

type LayoutProps = {
  title: string;
  error?: string | null;

  running: boolean;
  onToggle: () => void;

  phrase?: Phrase | null;
  lyrics?: string[]; // not rendered in layout

  livePitchHz?: number | null;
  confidence: number;
  confThreshold?: number;

  startAtMs?: number | null;
  leadInSec?: number;

  uiRunning?: boolean;
  isReady?: boolean;

  step: "low" | "high" | "play";
  loopPhase: LoopPhase;

  rhythm?: RhythmEvent[];
  melodyRhythm?: RhythmEvent[];
  bpm?: number;
  den?: number;
  tsNum?: number;

  keySig?: string | null;

  view?: "piano" | "sheet";

  clef?: "treble" | "bass" | null;
  lowHz?: number | null;
  highHz?: number | null;

  /** Optional: new footer session panel props */
  sessionPanel?: FooterSession;

  /** NEW: content to render as a vertical panel on the right side of the stage */
  stageAside?: React.ReactNode;

  /** NEW: button to show in the side panel footer (always visible) */
  stageAsideFooterButton: StageFooterButton;

  /** (Legacy) children were rendered between stage and footer; kept for back-compat */
  children?: React.ReactNode;
};

export default function GameLayout({
  title, // reserved
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
  sessionPanel,
  stageAside,
  stageAsideFooterButton,
  // eslint-disable-next-line react/no-children-prop
  children, // kept but unused by default in favor of stageAside
}: LayoutProps) {
  const showPlay = !!phrase;

  return (
    <main className="min-h-dvh h-dvh flex flex-col bg-[#f0f0f0] text-[#0f0f0f]">
      <div className="w-full flex-1 min-h-0 flex flex-col pb-0">
        {/* Stage row (fills available height); includes optional right-side panel */}
        <div className="w-full flex-1 min-h-0 px-0 md:px-6 pt-2">
          <GameStage
            phrase={phrase ?? null}
            running={running}
            lyrics={lyrics}
            livePitchHz={livePitchHz}
            confidence={confidence}
            confThreshold={confThreshold}
            startAtMs={startAtMs}
            leadInSec={leadInSec}
            rhythm={rhythm}
            melodyRhythm={melodyRhythm}
            bpm={bpm}
            den={den}
            tsNum={tsNum}
            keySig={keySig}
            view={view}
            clef={clef ?? undefined}
            lowHz={lowHz}
            highHz={highHz}
            stageAside={stageAside}
            stageAsideFooterButton={stageAsideFooterButton}
          />
        </div>

        {/* (Legacy) Below-stage area retained for compatibility; not needed for new stageAside flow */}
        {children ? (
          <div className="w-full flex justify-center px-6 pb-2">
            <div className="w-full max-w-7xl">{children}</div>
          </div>
        ) : null}
      </div>

      <GameFooter
        showPlay={showPlay}
        running={uiRunning ?? running}
        onToggle={onToggle}
        livePitchHz={livePitchHz}
        isReady={isReady}
        error={error}
        confidence={confidence}
        confThreshold={confThreshold}
        keySig={keySig}
        clef={clef}
        lowHz={lowHz}
        highHz={highHz}
        sessionPanel={sessionPanel}
      />
    </main>
  );
}
