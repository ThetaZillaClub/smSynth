// hooks/gameplay/useScoringLifecycle.ts
"use client";
import { useEffect, useRef, useState } from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { makeOnsetsFromRhythm } from "@/utils/phrase/onsets";
import { aggregateForSubmission } from "@/utils/scoring/aggregate";
import type { TakeScore } from "@/utils/scoring/score";
import type { PitchSample } from "@/utils/scoring/score";
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
  /** Clamp alignment/scoring length (seconds) */
  phraseLengthOverrideSec?: number;
  /** Adjust scoring tolerance per mode */
  optionsOverride?: {
    confMin?: number;
    centsOk?: number;
    onsetGraceMs?: number;
    maxAlignMs?: number;
    goodAlignMs?: number;
  };
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

  /** Timing-free: treat whole window as a single capture */
  timingFreeResponse?: boolean;
  /** Effective capture window used (seconds) */
  freeCaptureSec?: number;
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
    timingFreeResponse = false,
    freeCaptureSec,
  } = args;

  const [takeSnapshots, setTakeSnapshots] = useState<TakeSnapshot[]>([]);

  // Freeze content at lead-in
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

  // Record → Rest transition → score, snapshot, maybe submit aggregate
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

      // ── Timing-free adjustments:
      //  - ignore rhythmic alignment pressure (beats=[0], onsets=[0])
      //  - make pitch scoring slightly more forgiving
      const snapshotBeats =
        timingFreeResponse ? () => [0] : () => (haveRhythm ? hand.snapshotEvents() : []);

      const melodyOnsets =
        timingFreeResponse ? [0] : usedPhrase.notes.map((n) => n.startSec);

      const rhythmOnsets =
        timingFreeResponse ? undefined : makeOnsetsFromRhythm(usedRhythm, bpm, den);

      const optionsOverride = timingFreeResponse
        ? {
            confMin: 0.45,    // a bit more tolerant on low-volume voices
            centsOk: 80,      // widen "OK" window for pitch stability
            onsetGraceMs: 160 // just in case any onset math remains
          }
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
      });

      // Aggregate submit at end of session
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

      // Right-panel snapshots for analytics
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
    timingFreeResponse,
    freeCaptureSec,
  ]);

  return { takeSnapshots };
}
