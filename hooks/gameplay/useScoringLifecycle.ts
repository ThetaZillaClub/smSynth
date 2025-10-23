// hooks/gameplay/useScoringLifecycle.ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { makeOnsetsFromRhythm } from "@/utils/phrase/onsets";
import { aggregateForSubmission } from "@/utils/scoring/aggregate";
import type { TakeScore, PitchSample } from "@/utils/scoring/score";
import type { ScoringAlignmentOptions } from "@/hooks/gameplay/useScoringAlignment";

export type AlignFn = (
  samplesRaw: PitchSample[] | null | undefined,
  beatsRaw: number[] | null | undefined,
  leadInSec: number | null | undefined,
  opts?: ScoringAlignmentOptions
) => { samples: PitchSample[]; beats: number[] };

type ScoreTakeFn = (args: {
  phrase: Phrase;
  bpm: number;
  den: number;
  leadInSec: number;
  pitchLagSec: number;
  gestureLagSec: number;
  snapshotSamples: () => PitchSample[];
  snapshotBeats: () => number[];
  melodyOnsetsSec: number[];
  rhythmOnsetsSec?: number[] | null;
  align: AlignFn;
  phraseLengthOverrideSec?: number;
  optionsOverride?: {
    confMin?: number;
    centsOk?: number;
    onsetGraceMs?: number;
    maxAlignMs?: number;
    goodAlignMs?: number;
  };
  minHoldSec?: number;
}) => TakeScore;

export type TakeSnapshot = {
  phrase: Phrase;
  rhythm: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
};

type HandLike = { snapshotEvents: () => number[] };

export function useScoringLifecycle({
  loopPhase,
  pretestActive,
  phrase,
  rhythmEffective,
  melodyRhythm,
  bpm,
  den,
  leadInSec,
  calibratedLatencyMs,
  gestureLatencyMs,
  exerciseLoops,
  lessonSlug,
  sessionId,
  sessionScores,
  scoreTake,
  alignForScoring,
  sampler,
  hand,
  haveRhythm,
  timingFreeResponse = false,
  freeCaptureSec,
  freeMinHoldSec,
}: {
  loopPhase: string;
  pretestActive: boolean;
  phrase: Phrase | null;
  rhythmEffective: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
  bpm: number;
  den: number;
  leadInSec: number;
  calibratedLatencyMs: number | null;
  gestureLatencyMs: number;
  exerciseLoops: number | null | undefined;
  lessonSlug: string | null | undefined;
  sessionId: string | null | undefined;
  sessionScores: TakeScore[];
  scoreTake: ScoreTakeFn;
  alignForScoring: AlignFn;
  sampler: { snapshot: () => PitchSample[] };
  hand: HandLike;
  haveRhythm: boolean;
  timingFreeResponse?: boolean;
  freeCaptureSec?: number;
  freeMinHoldSec?: number;
}) {
  const [takeSnapshots, setTakeSnapshots] = useState<TakeSnapshot[]>([]);

  const phraseForTakeRef = useRef<Phrase | null>(null);
  const rhythmForTakeRef = useRef<RhythmEvent[] | null>(null);
  const melodyRhythmForTakeRef = useRef<RhythmEvent[] | null>(null);
  const sessionSubmittedRef = useRef(false);

  useEffect(() => {
    if (!pretestActive && loopPhase === "lead-in" && phrase) {
      phraseForTakeRef.current = phrase;
      rhythmForTakeRef.current = rhythmEffective;
      melodyRhythmForTakeRef.current = melodyRhythm ?? null;
    }
  }, [pretestActive, loopPhase, phrase, rhythmEffective, melodyRhythm]);

  const postAggregate = async (score: TakeScore) => {
    if (!lessonSlug) return;
    try {
      await fetch(`/api/lessons/${lessonSlug}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: sessionId ?? null,
          takeIndex: null,
          scoreVersion: 2,
          isAggregate: true,
          score,
          snapshots: undefined,
          visibility: {
            showPitch: true,
            showIntervals: true,
            showMelodyRhythm: !timingFreeResponse,
            showRhythmLine: !timingFreeResponse && haveRhythm,
          },
        }),
      });
    } catch {
      // best effort
    }
  };

  const prevPhaseRef = useRef(loopPhase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = loopPhase;

    if (!pretestActive && prev === "record" && loopPhase === "rest") {
      const usedPhrase = phraseForTakeRef.current ?? phrase;
      const usedRhythm = rhythmForTakeRef.current ?? rhythmEffective;
      if (!usedPhrase) return;

      const pitchLagSec = 0.02;
      const gestureLagSec = ((calibratedLatencyMs ?? gestureLatencyMs) || 0) / 1000;

      const snapshotBeats =
        timingFreeResponse ? () => [0] : () => (haveRhythm ? hand.snapshotEvents() : []);

      const melodyOnsets = timingFreeResponse ? [0] : usedPhrase.notes.map((n) => n.startSec);
      const rhythmOnsets = timingFreeResponse ? undefined : makeOnsetsFromRhythm(usedRhythm, bpm, den);

      const optionsOverride = timingFreeResponse
        ? { confMin: 0.5, centsOk: 80, onsetGraceMs: 160 }
        : undefined;

      const score = scoreTake({
        phrase: usedPhrase,
        bpm,
        den,
        leadInSec,
        pitchLagSec,
        gestureLagSec,
        snapshotSamples: () => sampler.snapshot(),
        snapshotBeats,
        melodyOnsetsSec: melodyOnsets,
        rhythmOnsetsSec: rhythmOnsets ?? null,
        align: alignForScoring,
        phraseLengthOverrideSec:
          timingFreeResponse && typeof freeCaptureSec === "number" && freeCaptureSec > 0
            ? freeCaptureSec
            : undefined,
        optionsOverride,
        minHoldSec: typeof freeMinHoldSec === "number" ? freeMinHoldSec : undefined,
      });

      // snapshot the *evaluation* phrase we actually scored
      const phraseForSnapshots = ((score as any).__evalPhrase ?? usedPhrase)!;
      setTakeSnapshots((xs) => [
        ...xs,
        { phrase: phraseForSnapshots, rhythm: usedRhythm ?? null, melodyRhythm: melodyRhythmForTakeRef.current ?? null },
      ]);

      const loops =
        typeof exerciseLoops === "number" && Number.isFinite(exerciseLoops) && exerciseLoops > 0
          ? exerciseLoops
          : null;

      const totalTakesNow = sessionScores.length + 1;
      if (lessonSlug && loops != null && totalTakesNow >= loops && !sessionSubmittedRef.current) {
        sessionSubmittedRef.current = true;
        const allScores = [...sessionScores, score];
        const aggScore = aggregateForSubmission(allScores);
        void postAggregate(aggScore);
      }
    }
  }, [
    loopPhase,
    pretestActive,
    phrase,
    rhythmEffective,
    bpm,
    den,
    leadInSec,
    calibratedLatencyMs,
    gestureLatencyMs,
    exerciseLoops,
    lessonSlug,
    sessionId,
    sessionScores,
    scoreTake,
    alignForScoring,
    sampler,
    hand,
    haveRhythm,
    timingFreeResponse,
    freeCaptureSec,
    freeMinHoldSec,
  ]);

  return { takeSnapshots };
}
