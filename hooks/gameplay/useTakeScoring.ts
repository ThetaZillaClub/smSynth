// hooks/gameplay/useTakeScoring.ts
"use client";
import { useCallback, useState } from "react";
import { computeTakeScore, type PitchSample, type TakeScore } from "@/utils/scoring/score";

type AlignFn = (
  samplesRaw: PitchSample[] | null | undefined,
  beatsRaw: number[] | null | undefined,
  leadInSec: number | null | undefined,
  opts?: { clipBelowSec?: number; pitchLagSec?: number; gestureLagSec?: number }
) => { samples: PitchSample[]; beats: number[] };

export default function useTakeScoring() {
  const [lastScore, setLastScore] = useState<TakeScore | null>(null);
  const [sessionScores, setSessionScores] = useState<TakeScore[]>([]);

  const scoreTake = useCallback((args: {
    phrase: any;
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
  }) => {
    const { samples, beats } = args.align(
      args.snapshotSamples(),
      args.snapshotBeats(),
      args.leadInSec,
      { clipBelowSec: 0.5, pitchLagSec: args.pitchLagSec, gestureLagSec: args.gestureLagSec }
    );

    const score = computeTakeScore({
      phrase: args.phrase,
      bpm: args.bpm,
      den: args.den,
      samples,
      gestureEventsSec: beats,
      melodyOnsetsSec: args.melodyOnsetsSec,
      rhythmLineOnsetsSec: args.rhythmOnsetsSec ?? undefined,
      options: {
        // 👇 no extra conf gate; cents/latency knobs unchanged
        confMin: 0,
        centsOk: 50,
        onsetGraceMs: 120,
        maxAlignMs: 300,
        goodAlignMs: 120,
      },
    });

    setLastScore(score);
    setSessionScores((s) => [...s, score]);
    return score;
  }, []);

  return { lastScore, sessionScores, scoreTake };
}
