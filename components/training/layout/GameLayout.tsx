// components/training/layout/GameLayout.tsx
"use client";
import React from "react";
import GameStage from "./stage/GameStage";
import GameFooter from "./footer/GameFooter";
import { type Phrase } from "./stage/piano-roll/PianoRollCanvas";
import type { LoopPhase } from "../../../hooks/gameplay/usePracticeLoop";
import TrainingSidePanel, { type TrainingSidePanelProps } from "./stage/side-panel/TrainingSidePanel";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import type { ScaleName } from "@/utils/phrase/scales";
import type { TakeScore } from "@/utils/scoring/score";

type FooterSession = NonNullable<React.ComponentProps<typeof GameFooter>["sessionPanel"]>;

type AnalyticsPayload = {
  scores: TakeScore[];
  snapshots: Array<{ phrase: any; rhythm: any; melodyRhythm: any }>;
  bpm: number;
  den: number;
  tonicPc?: number;
  scaleName?: ScaleName | (string & {});
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

  keySig?: string | null;

  view?: "piano" | "sheet" | "analytics";

  clef?: "treble" | "bass" | null;
  lowHz?: number | null;
  highHz?: number | null;

  /** Optional: footer session panel props */
  sessionPanel?: FooterSession;

  /** Right-side panel content (legacy free-form) */
  stageAside?: React.ReactNode;

  /**
   * Structured props for the built-in TrainingSidePanel.
   * If provided, this takes precedence over `stageAside`.
   */
  sidePanel?: TrainingSidePanelProps;

  /** (Legacy) children were rendered between stage and footer; kept for back-compat */
  children?: React.ReactNode;

  /** Timing & rhythm (forwarded to stage if present) */
  rhythm?: RhythmEvent[] | null;
  melodyRhythm?: RhythmEvent[] | null;
  bpm?: number;
  den?: number;
  tsNum?: number;

  /** 🔑 NEW: feed mode-aware solfege into piano roll */
  tonicPc?: number | null;
  scaleName?: ScaleName | null;

  /** NEW: footer actions */
  tonicAction?: React.ComponentProps<typeof GameFooter>["tonicAction"];
  arpAction?: React.ComponentProps<typeof GameFooter>["arpAction"];

  /** NEW: analytics payload for post-exercise stage */
  analytics?: AnalyticsPayload;

  /** NEW: replace right-side panel *only* when view === "analytics" */
  analyticsSidePanel?: React.ReactNode;
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
  sessionPanel,
  stageAside,
  sidePanel,
  children,

  // NEW
  tonicPc = null,
  scaleName = null,
  tonicAction,
  arpAction,

  analytics,
  analyticsSidePanel,
}: LayoutProps) {
  const showPlay = !!phrase;

  // Choose panel: when analytics view, prefer the special side panel if provided.
  const asideNode =
    view === "analytics" && analyticsSidePanel
      ? analyticsSidePanel
      : sidePanel
      ? <TrainingSidePanel {...sidePanel} />
      : stageAside;

  return (
    <main className="min-h-dvh h-dvh flex flex-col bg-[#f0f0f0] text-[#0f0f0f]">
      <h1 className="sr-only">{title}</h1>

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
            rhythm={rhythm ?? undefined}
            melodyRhythm={melodyRhythm ?? undefined}
            bpm={bpm}
            den={den}
            tsNum={tsNum}
            keySig={keySig}
            view={view}
            clef={clef ?? undefined}
            lowHz={lowHz}
            highHz={highHz}
            stageAside={asideNode}
            /* forward for back-compat so they aren't "unused" */
            step={step}
            loopPhase={loopPhase}

            // 🔑 NEW: mode-aware solfege for piano roll
            tonicPc={typeof tonicPc === "number" ? tonicPc : undefined}
            scaleName={scaleName ?? undefined}

            // NEW: analytics payload
            analytics={analytics}
          />
        </div>

        {/* (Legacy) Below-stage area retained for compatibility; not needed for new side panel flow */}
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
        scaleName={scaleName ?? null}
        tonicPc={typeof tonicPc === "number" ? tonicPc : null}
        tonicAction={tonicAction}
        arpAction={arpAction}
      />
    </main>
  );
}
