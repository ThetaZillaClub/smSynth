"use client";
import { useEffect, useRef, useState } from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { makeOnsetsFromRhythm } from "@/utils/phrase/onsets";
import { aggregateForSubmission } from "@/utils/scoring/aggregate";
import type { TakeScore } from "@/utils/scoring/score";
import type { PitchSample } from "@/utils/scoring/score";
import type { ScoringAlignmentOptions } from "@/hooks/gameplay/useScoringAlignment";
// Match your align function signature
export type AlignFn = (
  samplesRaw: PitchSample[] | null | undefined,
  beatsRaw: number[] | null | undefined,
  leadInSec: number | null | undefined,
  opts?: ScoringAlignmentOptions
) => { samples: PitchSample[]; beats: number[] };

// Match your scoreTake signature
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
}) => TakeScore;

export type TakeSnapshot = {
  phrase: Phrase;
  rhythm: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
};

type HandLike = { snapshotEvents: () => number[] };

type ScoringLifecycleArgs = {
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
};

export function useScoringLifecycle(args: ScoringLifecycleArgs) {
  const {
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
  } = args;

  const [takeSnapshots, setTakeSnapshots] = useState<TakeSnapshot[]>([]);

  // capture the exact phrase/rhythm chosen at lead-in
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

  // detect record->rest transition to score/submit/snapshot
  const prevPhaseRef = useRef(loopPhase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = loopPhase;

    if (!pretestActive && prev === "record" && loopPhase === "rest") {
      const usedPhrase = phraseForTakeRef.current ?? phrase;
      const usedRhythm = rhythmForTakeRef.current ?? rhythmEffective;
      if (!usedPhrase) return;

      const pitchLagSec = 0.02; // DEFAULT_PITCH_LATENCY_MS / 1000
      const gestureLagSec = ((calibratedLatencyMs ?? gestureLatencyMs) || 0) / 1000;

      const score = scoreTake({
        phrase: usedPhrase,
        bpm,
        den,
        leadInSec,
        pitchLagSec,
        gestureLagSec,
        snapshotSamples: () => sampler.snapshot(),
        snapshotBeats: () => (haveRhythm ? hand.snapshotEvents() : []),
        melodyOnsetsSec: usedPhrase.notes.map((n) => n.startSec),
        rhythmOnsetsSec: makeOnsetsFromRhythm(usedRhythm, bpm, den),
        align: alignForScoring,
      });

      // Submit aggregated row once we reach exerciseLoops
      const totalTakesNow = sessionScores.length + 1;
      const maxTakes = Math.max(1, Number(exerciseLoops ?? 10));

      if (lessonSlug && sessionId && totalTakesNow >= maxTakes && !sessionSubmittedRef.current) {
        sessionSubmittedRef.current = true;
        const allScores = [...sessionScores, score];
        const aggScore = aggregateForSubmission(allScores);

        const snapshots = {
          perTakeFinals: allScores.map((s, i) => ({ i, final: s.final.percent })),
          perTakePitch: allScores.map((s, i) => ({ i, pct: s.pitch.percent })),
        };

        void fetch(`/api/lessons/${lessonSlug}/results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sessionId,
            takeIndex: totalTakesNow - 1,
            score: aggScore,
            snapshots,
          }),
        }).catch(() => {});
      }

      // side-panel snapshots
      setTakeSnapshots((xs) => [
        ...xs,
        {
          phrase: usedPhrase,
          rhythm: usedRhythm ?? null,
          melodyRhythm: melodyRhythmForTakeRef.current ?? null,
        },
      ]);
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
    sessionScores,
    exerciseLoops,
    lessonSlug,
    sessionId,
    scoreTake,
    alignForScoring,
    sampler,
    hand,
    haveRhythm,
  ]);

  return { takeSnapshots };
}
