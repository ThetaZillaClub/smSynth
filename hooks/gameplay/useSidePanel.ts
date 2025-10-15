"use client";
import { useMemo } from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import type { TakeSnapshot } from "./useScoringLifecycle";

// Loosen player function signatures so you can pass the raw fns
type PlayerFns = {
  playPhrase: (...args: any[]) => Promise<void>;
  playRhythm: (...args: any[]) => Promise<void>;
  playMelodyAndRhythm: (...args: any[]) => Promise<void>;
  stop: (...args: any[]) => void | Promise<void>;
};

export function useSidePanel({
  pretestActive,
  pretestStatusText,
  pretestRunning,
  pretestInResponse,
  currentPretestKind,
  pretestStart,
  continueResponse,
  bpm,
  tsNum,
  den,
  tonicPc,
  lowHz,
  scaleName,
  liveHz,
  confidence,
  playMidiList,
  sessionScores,
  takeSnapshots,
  phrase,
  rhythmEffective,
  haveRhythm,
  player,
}: {
  pretestActive: boolean;
  pretestStatusText: string;
  pretestRunning: boolean;
  pretestInResponse: boolean;
  currentPretestKind?: "single_tonic" | "derived_tonic" | "guided_arpeggio" | "internal_arpeggio";
  pretestStart: () => void;
  continueResponse: () => void;
  bpm: number;
  tsNum: number;
  den: number;
  tonicPc: number;
  lowHz: number | null;
  scaleName: string;
  liveHz: number | null;
  confidence: number | null;
  playMidiList: (notes: number[], dur: number) => Promise<void>;
  sessionScores: any[];
  takeSnapshots: TakeSnapshot[];
  phrase: Phrase | null;
  rhythmEffective: RhythmEvent[] | null;
  haveRhythm: boolean;
  player: PlayerFns;
}) {
  return useMemo(() => {
    return {
      pretest: {
        active: pretestActive,
        statusText: pretestStatusText,
        running: pretestRunning,
        inResponse: pretestInResponse,
        modeKind: currentPretestKind,
        start: pretestStart,
        continueResponse,
        bpm,
        tsNum,
        tonicPc,
        lowHz,
        scaleName,
        liveHz,
        confidence: confidence ?? 0, // GameLayout expects number
        playMidiList,
      },
      scores: sessionScores,
      snapshots: takeSnapshots,
      currentPhrase: phrase,
      currentRhythm: rhythmEffective,
      haveRhythm,
      player,
      bpm,
      den,
      tsNum,
      tonicPc,
      scaleName,
    } as const;
  }, [
    pretestActive,
    pretestStatusText,
    pretestRunning,
    pretestInResponse,
    currentPretestKind,
    pretestStart,
    continueResponse,
    bpm,
    tsNum,
    den,
    tonicPc,
    lowHz,
    scaleName,
    liveHz,
    confidence,
    playMidiList,
    sessionScores,
    takeSnapshots,
    phrase,
    rhythmEffective,
    haveRhythm,
    player,
  ]);
}
