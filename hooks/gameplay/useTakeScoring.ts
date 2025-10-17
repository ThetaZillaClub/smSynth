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

type SubmitArgs = {
  /** lesson slug for the API path: /api/lessons/[lesson]/results */
  lessonSlug: string;
  /** your session UUID for the “Overall session” */
  sessionId: string;
  /** 0-based index within the session */
  takeIndex: number;
  /** optional extra payload to stash alongside the take */
  snapshots?: unknown;
};

export default function useTakeScoring() {
  const [lastScore, setLastScore] = useState<TakeScore | null>(null);
  const [sessionScores, setSessionScores] = useState<TakeScore[]>([]);
  const [lastResultId, setLastResultId] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  const phraseWindowSec = (phrase: Phrase): number => {
    if (!phrase?.notes?.length) return phrase?.durationSec ?? 0;
    let end = 0;
    for (const n of phrase.notes) end = Math.max(end, n.startSec + n.durSec);
    return end;
  };

  /**
   * Compute a TakeScore locally (no network). Existing callers can keep using this.
   */
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
        // keep a little grace before t=0 and clamp to the actual phrase window
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
        confMin: 0.5,
        centsOk: 60,
        onsetGraceMs: 100,
        maxAlignMs: 250,
        goodAlignMs: 120,
      },
    });

    setLastScore(score);
    setSessionScores((s) => [...s, score]);
    return score;
  }, []);

  /**
   * New: compute and immediately POST the combined score to the server.
   * Returns the score and (if available) the inserted resultId from the API.
   */
  const scoreTakeAndSubmit = useCallback(async (args: {
    // scoring inputs (same as scoreTake)
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
    // submit inputs
    submit: SubmitArgs;
  }): Promise<{ score: TakeScore; resultId?: string }> => {
    const {
      phrase, bpm, den, leadInSec, pitchLagSec, gestureLagSec,
      snapshotSamples, snapshotBeats, melodyOnsetsSec, rhythmOnsetsSec, align,
      submit,
    } = args;

    // 1) compute locally
    const score = scoreTake({
      phrase, bpm, den, leadInSec, pitchLagSec, gestureLagSec,
      snapshotSamples, snapshotBeats, melodyOnsetsSec, rhythmOnsetsSec, align,
    });

    // 2) POST to API
    setPostError(null);
    setLastResultId(null);
    try {
      const res = await fetch(`/api/lessons/${encodeURIComponent(submit.lessonSlug)}/results`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: submit.sessionId,
          takeIndex: Math.max(0, Math.floor(submit.takeIndex)),
          score, // full TakeScore (pitch, rhythm, intervals, final)
          snapshots: submit.snapshots,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = (err && err.error) ? String(err.error) : `HTTP ${res.status}`;
        setPostError(msg);
        return { score };
      }

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; resultId?: string };
      if (json?.resultId) setLastResultId(String(json.resultId));
      return { score, resultId: json?.resultId };
    } catch (e: any) {
      setPostError(e?.message || String(e));
      return { score };
    }
  }, [scoreTake]);

  return {
    lastScore,
    sessionScores,
    scoreTake,
    scoreTakeAndSubmit, // ← use this after a take ends to compute + POST
    lastResultId,
    postError,
  };
}
