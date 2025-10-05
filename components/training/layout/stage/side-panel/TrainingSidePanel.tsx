// components/training/layout/stage/side-panel/TrainingSidePanel.tsx
"use client";

import * as React from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import type { TakeScore } from "@/utils/scoring/score";
import type { ScaleName } from "@/utils/phrase/scales";

import SidePanelScores from "./SidePanelScores";
import TakeReview from "./TakeReview";
import OverallReview from "./SidePanelScores/OverallReview";
import PretestPanel from "@/components/training/pretest/PretestPanel";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";

type TakeSnapshot = { phrase: Phrase; rhythm: RhythmEvent[] | null };

type ModeKind =
  | "single_tonic"
  | "derived_tonic"
  | "guided_arpeggio"
  | "internal_arpeggio"
  | undefined;

type PretestBundle = {
  active: boolean;
  statusText: string;
  running: boolean;
  inResponse: boolean;
  modeKind: ModeKind;
  start: () => void;
  continueResponse: () => void;

  // musical context needed by PretestPanel
  bpm: number;
  tsNum: number;
  tonicPc: number;
  lowHz: number | null;

  // Narrow to ScaleName for the pretest component; upstream callers can still pass strings.
  scaleName: ScaleName | (string & {});

  // audio
  liveHz: number | null;
  confidence: number;
  playMidiList: (midi: number[], noteDurSec: number) => Promise<void> | void;
};

type PlayerFns = {
  playPhrase: (
    phrase: Phrase,
    opts: { bpm: number; tsNum: number; tsDen: number; leadBars?: number; metronome?: boolean }
  ) => Promise<void> | void;
  playRhythm: (
    rhythm: RhythmEvent[],
    opts: { bpm: number; tsNum: number; tsDen: number; leadBars?: number }
  ) => Promise<void> | void;
  playMelodyAndRhythm: (
    phrase: Phrase,
    rhythm: RhythmEvent[],
    opts: { bpm: number; tsNum: number; tsDen: number; metronome?: boolean }
  ) => Promise<void> | void;
  stop: () => void;
};

export type TrainingSidePanelProps = {
  // pretest
  pretest: PretestBundle;

  // session/take data
  scores: TakeScore[];
  snapshots: TakeSnapshot[];

  // "current" exercise (when no take is selected)
  currentPhrase: Phrase | null | undefined;
  currentRhythm: RhythmEvent[] | null | undefined;

  // playback + context
  haveRhythm: boolean;
  player: PlayerFns;
  bpm: number;
  den: number;
  tsNum: number;
  tonicPc: number;

  /** For solfège displays, keep broader solfège scale names here */
  scaleName?: SolfegeScaleName | (string & {});

  // redo a specific take
  onRedo: (index: number) => void;
};

export default function TrainingSidePanel(props: TrainingSidePanelProps) {
  const {
    // pretest
    pretest,

    // session/take data
    scores,
    snapshots,

    // "current" exercise (when no take is selected)
    currentPhrase,
    currentRhythm,

    // playback + context
    haveRhythm,
    player,
    bpm,
    den,
    tsNum,
    tonicPc,
    scaleName = "major",

    // redo a specific take
    onRedo,
  } = props;

  // - null  -> list
  // - -1    -> overall
  // - 0..N-1-> take detail
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  const isOverall = openIndex === -1;
  const validTake =
    typeof openIndex === "number" && openIndex >= 0 && openIndex < scores.length;

  // Decide which phrase/rhythm to use for playback (selected take vs. current)
  const selectedSnap = validTake ? snapshots[openIndex!] : null;
  const effectivePhrase = selectedSnap?.phrase ?? currentPhrase ?? null;
  const effectiveRhythm = selectedSnap?.rhythm ?? currentRhythm ?? null;

  const onPlayMelody = async () => {
    if (!effectivePhrase) return;
    await player.playPhrase(effectivePhrase, { bpm, tsNum, tsDen: den, leadBars: 0, metronome: false });
  };

  const onPlayRhythm = async () => {
    if (!haveRhythm || !effectiveRhythm?.length) return;
    await player.playRhythm(effectiveRhythm, { bpm, tsNum, tsDen: den, leadBars: 0 });
  };

  const onPlayBoth = async () => {
    if (!haveRhythm || !effectiveRhythm?.length || !effectivePhrase) return;
    await player.playMelodyAndRhythm(effectivePhrase, effectiveRhythm, { bpm, tsNum, tsDen: den, metronome: true });
  };

  const onStop = () => player.stop();

  // ────────────────────────────────────────────────────────────────────────────
  // Render router
  // ────────────────────────────────────────────────────────────────────────────
  if (pretest.active) {
    return (
      <PretestPanel
        statusText={pretest.statusText}
        running={pretest.running}
        inResponse={pretest.inResponse}
        modeKind={pretest.modeKind}
        onStart={pretest.start}
        onContinue={pretest.continueResponse}
        bpm={pretest.bpm}
        tsNum={pretest.tsNum}
        tonicPc={pretest.tonicPc}
        lowHz={pretest.lowHz}
        // Cast to the narrower type the pretest panel expects
        scaleName={pretest.scaleName as ScaleName}
        liveHz={pretest.liveHz}
        confidence={pretest.confidence}
        playMidiList={pretest.playMidiList}
      />
    );
  }

  if (openIndex == null) {
    return <SidePanelScores scores={scores} onOpen={setOpenIndex} />;
  }

  if (isOverall) {
    return (
      <OverallReview
        scores={scores}
        snapshots={snapshots}
        onClose={() => setOpenIndex(null)}
        bpm={bpm}
        den={den}
        tonicPc={tonicPc}
        // For solfège displays, keep broader solfège scale names
        scaleName={scaleName as SolfegeScaleName}
      />
    );
    }

  if (validTake && effectivePhrase) {
    return (
      <TakeReview
        haveRhythm={haveRhythm}
        onPlayMelody={onPlayMelody}
        onPlayRhythm={onPlayRhythm}
        onPlayBoth={onPlayBoth}
        onStop={onStop}
        score={scores[openIndex!]}
        onClose={() => setOpenIndex(null)}
        onRedo={() => onRedo(openIndex!)}
        phrase={effectivePhrase}
        bpm={bpm}
        den={den}
        tsNum={tsNum}
        tonicPc={tonicPc}
        scaleName={scaleName as SolfegeScaleName}
      />
    );
  }

  // Fallback (out of range index or no phrase)
  return <SidePanelScores scores={scores} onOpen={setOpenIndex} />;
}
