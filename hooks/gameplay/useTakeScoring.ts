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
  lessonSlug: string;
  sessionId: string;
  takeIndex: number;
  snapshots?: unknown;
};

type ScoreOptions = {
  confMin: number;
  centsOk: number;
  onsetGraceMs: number;
  maxAlignMs: number;
  goodAlignMs: number;
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

  /** Flatten to single sustained note for timing-free scoring. */
  const buildTimingFreePhrase = (src: Phrase, durSec: number): Phrase => {
    const midi = src?.notes?.[0]?.midi ?? 60;
    return { ...src, durationSec: durSec, notes: [{ midi, startSec: 0, durSec }] };
  };

  /** First/last confident voiced timestamps in the raw capture. */
  const voicedBounds = (
    samples: PitchSample[],
    confMin: number
  ): { startSec: number; endSec: number } | null => {
    const voiced = samples
      .filter((s) => (s.hz ?? 0) > 0 && (s.conf ?? 0) >= confMin)
      .sort((a, b) => a.tSec - b.tSec);
    if (!voiced.length) return null;
    return { startSec: voiced[0].tSec, endSec: voiced[voiced.length - 1].tSec };
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
    phraseLengthOverrideSec?: number;
    /** Relax/tighten scoring per mode */
    optionsOverride?: Partial<ScoreOptions>;
  }) => {
    // Defaults for pitch/rhythm scoring
    const defaults: ScoreOptions = {
      confMin: 0.5,
      centsOk: 60,
      onsetGraceMs: 100,
      maxAlignMs: 250,
      goodAlignMs: 120,
    };
    const opts: ScoreOptions = { ...defaults, ...(args.optionsOverride ?? {}) };

    // Detect timing-free intent
    const isTimingFree =
      (args.melodyOnsetsSec?.length ?? 0) <= 1 &&
      (!args.rhythmOnsetsSec || args.rhythmOnsetsSec.length === 0);

    // Snapshot BEFORE alignment
    const rawSamples = args.snapshotSamples();

    // Choose evaluation phrase & window
    let phraseForEval: Phrase = args.phrase;
    let evalPhraseLenSec = args.phraseLengthOverrideSec ?? phraseWindowSec(args.phrase);

    // In timing-free: rebase to first voiced, and evaluate only the voiced span.
    let extraOffsetSec: number | undefined = undefined;
    let beatsRawForAlign: number[] = [];
    let gestureLagForAlign = args.gestureLagSec;

    if (isTimingFree) {
      const vb = voicedBounds(rawSamples, opts.confMin);
      if (vb) {
        const spanSec = Math.max(0.5, Math.min(vb.endSec - vb.startSec, 15));
        evalPhraseLenSec = spanSec;
        phraseForEval = buildTimingFreePhrase(args.phrase, spanSec);

        // Make first voiced frame map to ~t=0 for SAMPLES:
        // align shifts by (leadIn + pitchLag + extraOffset) → choose extraOffset
        // so t' = t - vb.startSec  (i.e., samples first-voice lands at 0).
        extraOffsetSec = vb.startSec - args.leadInSec - args.pitchLagSec;

        // For BEATS: feed an artificial event AT vb.startSec and make
        // gestureLag == pitchLag for this align call so the beat lands at 0 too.
        beatsRawForAlign = [vb.startSec];
        gestureLagForAlign = args.pitchLagSec;
      } else {
        // No confident audio: keep legacy behavior
        evalPhraseLenSec = 0.5;
        phraseForEval = buildTimingFreePhrase(args.phrase, 0.5);
        beatsRawForAlign = [0];
      }
    } else {
      // Non timing-free: use the real gesture events
      beatsRawForAlign = args.snapshotBeats();
    }

    // Align samples & beats to the evaluation window
    const { samples, beats } = args.align(
      rawSamples,
      beatsRawForAlign,
      args.leadInSec,
      {
        keepPreRollSec: isTimingFree ? 0 : 0.5, // drop any pre-voice negatives
        phraseLengthSec: evalPhraseLenSec,
        tailGuardSec: 0.25,
        pitchLagSec: args.pitchLagSec,
        gestureLagSec: gestureLagForAlign,
        extraOffsetSec, // only non-undefined in timing-free
        devAssert: process.env.NODE_ENV !== "production",
        consolePrefix: "score-align",
      }
    );

    // Final scoring (timing-free passes [0] as the sole melody onset)
    const score = computeTakeScore({
      phrase: phraseForEval,
      bpm: args.bpm,
      den: args.den,
      samples,
      gestureEventsSec: beats,
      melodyOnsetsSec: isTimingFree ? [0] : args.melodyOnsetsSec,
      rhythmLineOnsetsSec: isTimingFree ? undefined : args.rhythmOnsetsSec ?? undefined,
      options: {
        confMin: opts.confMin,
        centsOk: opts.centsOk,
        onsetGraceMs: opts.onsetGraceMs,
        maxAlignMs: opts.maxAlignMs,
        goodAlignMs: opts.goodAlignMs,
      },
    });

    // session state
    setLastScore(score);
    setSessionScores((s) => [...s, score]);
    return score;
  }, []);

  const scoreTakeAndSubmit = useCallback(async (args: {
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
    submit: SubmitArgs;
    phraseLengthOverrideSec?: number;
    optionsOverride?: Partial<ScoreOptions>;
  }): Promise<{ score: TakeScore; resultId?: string }> => {
    const {
      phrase, bpm, den, leadInSec, pitchLagSec, gestureLagSec,
      snapshotSamples, snapshotBeats, melodyOnsetsSec, rhythmOnsetsSec, align,
      submit, phraseLengthOverrideSec, optionsOverride,
    } = args;

    const score = scoreTake({
      phrase, bpm, den, leadInSec, pitchLagSec, gestureLagSec,
      snapshotSamples, snapshotBeats, melodyOnsetsSec, rhythmOnsetsSec, align,
      phraseLengthOverrideSec,
      optionsOverride,
    });

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
          score,
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
    scoreTakeAndSubmit,
    lastResultId,
    postError,
  };
}
