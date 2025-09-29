// hooks/gameplay/useTakeScoring.ts
"use client";
import { useCallback, useState } from "react";
import { computeTakeScore, type PitchSample, type TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { ScoringAlignmentOptions } from "@/hooks/gameplay/useScoringAlignment";

type AlignFn = (
  samplesRaw: PitchSample[] | null | undefined,
  beatsRaw: number[] | null | undefined,
  leadInSec: number | null | undefined,
  opts?: ScoringAlignmentOptions
) => { samples: PitchSample[]; beats: number[] };

export default function useTakeScoring() {
  const [lastScore, setLastScore] = useState<TakeScore | null>(null);
  const [sessionScores, setSessionScores] = useState<TakeScore[]>([]);

  const phraseWindowSec = (phrase: Phrase): number => {
    if (!phrase?.notes?.length) return phrase?.durationSec ?? 0;
    let end = 0;
    for (const n of phrase.notes) end = Math.max(end, n.startSec + n.durSec);
    return end;
  };

  const scoreTake = useCallback((args: {
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
  }) => {
    const { samples, beats } = args.align(
      args.snapshotSamples(),
      args.snapshotBeats(),
      args.leadInSec,
      {
        // ⬇️ keep a little grace before t=0 and clamp to the actual phrase window
        keepPreRollSec: 0.5,
        phraseLengthSec: phraseWindowSec(args.phrase),
        tailGuardSec: 0.25,
        // per-pipeline lags
        pitchLagSec: args.pitchLagSec,
        gestureLagSec: args.gestureLagSec,
        // helpful during dev
        devAssert: process.env.NODE_ENV !== "production",
        consolePrefix: "score-align",
      }
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
