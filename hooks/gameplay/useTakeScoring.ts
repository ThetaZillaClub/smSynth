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

  /**
   * Build a "timing-free" single-note phrase whose duration equals the captured audio span.
   * We keep the first note's MIDI as the target pitch anchor.
   */
  const buildTimingFreePhrase = (src: Phrase, durSec: number): Phrase => {
    const midi = src?.notes?.[0]?.midi ?? 60; // fallback to C4 if missing
    const base: Phrase = {
      ...src,
      durationSec: durSec,
      notes: [{ midi, startSec: 0, durSec }],
    };
    return base;
  };

  const measureCapturedSpanSec = (samples: PitchSample[], confMin: number): number => {
    const voiced = samples
      .filter((s) => (s.hz ?? 0) > 0 && (s.conf ?? 0) >= confMin)
      .sort((a, b) => a.tSec - b.tSec);

    if (voiced.length >= 2) {
      const span = voiced[voiced.length - 1].tSec - voiced[0].tSec;
      // Be conservative; clamp to a sane window
      return Math.max(0.5, Math.min(span, 15));
    }
    // Worst case: tiny blip — still evaluate against a short, humane window
    return 0.5;
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
    // ----- Defaults used by alignment & pitch/rhythm scoring
    const defaults: ScoreOptions = {
      confMin: 0.5,
      centsOk: 60,
      onsetGraceMs: 100,
      maxAlignMs: 250,
      goodAlignMs: 120,
    };
    const opts: ScoreOptions = { ...defaults, ...(args.optionsOverride ?? {}) };

    // ----- Detect "timing-free" intent (Pitch-Tune style): single capture with no rhythmic line
    const isTimingFree =
      (args.melodyOnsetsSec?.length ?? 0) <= 1 &&
      (!args.rhythmOnsetsSec || args.rhythmOnsetsSec.length === 0);

    // Snapshot raw samples BEFORE alignment to measure the actual captured span
    const rawSamples = args.snapshotSamples();

    // Choose evaluation phrase & aligned window length
    let phraseForEval: Phrase = args.phrase;
    let evalPhraseLenSec =
      args.phraseLengthOverrideSec ?? phraseWindowSec(args.phrase);

    if (isTimingFree) {
      // Use the *actual voiced span* as the evaluation window,
      // then flatten to a single long note to avoid penalizing for non-sung time.
      const spanSec = measureCapturedSpanSec(rawSamples, opts.confMin);
      evalPhraseLenSec = spanSec;
      phraseForEval = buildTimingFreePhrase(args.phrase, spanSec);
    }

    // Align samples & (optional) gesture beats to the evaluation window
    const { samples, beats } = args.align(
      rawSamples,
      isTimingFree ? [0] : args.snapshotBeats(),
      args.leadInSec,
      {
        keepPreRollSec: 0.5,
        phraseLengthSec: evalPhraseLenSec,
        tailGuardSec: 0.25,
        pitchLagSec: args.pitchLagSec,
        gestureLagSec: args.gestureLagSec,
        devAssert: process.env.NODE_ENV !== "production",
        consolePrefix: "score-align",
      }
    );

    // Compute the take score against the *evaluation* phrase (possibly flattened)
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
