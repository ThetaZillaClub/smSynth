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

  /** Flatten to single sustained note for timing-free scoring (fallback). */
  const buildTimingFreePhrase = (src: Phrase, durSec: number): Phrase => {
    const midi = src?.notes?.[0]?.midi ?? 60;
    return { ...src, durationSec: durSec, notes: [{ midi, startSec: 0, durSec }] };
  };

  /** Build a multi-note eval phrase from detected runs, using target MIDIs from the generated phrase. */
  const buildTimingFreeMultiPhrase = (
    src: Phrase,
    runs: Array<{ startSec: number; endSec: number }>
  ): Phrase => {
    const want = Math.max(1, src?.notes?.length ?? 1);
    const K = Math.min(runs.length, want);
    let t = 0;
    const notes = Array.from({ length: K }, (_, i) => {
      const durSec = Math.max(0, runs[i].endSec - runs[i].startSec);
      const midi = src?.notes?.[i]?.midi ?? src?.notes?.[0]?.midi ?? 60;
      const out = { midi, startSec: t, durSec };
      t += durSec;
      return out;
    });
    const durationSec = notes.reduce((s, n) => s + n.durSec, 0);
    return { ...src, durationSec, notes };
  };

  /**
   * Find up to `maxRuns` contiguous confident runs (earliest-first),
   * each at least `minHoldSec` long. Gaps > maxGapSec split runs.
   */
  const findSuccessfulRuns = (
    samples: PitchSample[],
    confMin: number,
    minHoldSec: number,
    maxRuns: number,
    maxGapSec = 0.12
  ): Array<{ startSec: number; endSec: number }> => {
    const voiced = samples
      .filter((s) => (s.hz ?? 0) > 0 && (s.conf ?? 0) >= confMin)
      .sort((a, b) => a.tSec - b.tSec);
    if (!voiced.length || maxRuns <= 0) return [];
    const segs: Array<{ startSec: number; endSec: number }> = [];
    let segStart = 0;
    for (let i = 1; i < voiced.length; i++) {
      if (voiced[i].tSec - voiced[i - 1].tSec > maxGapSec) {
        segs.push({ startSec: voiced[segStart].tSec, endSec: voiced[i - 1].tSec });
        segStart = i;
      }
    }
    segs.push({ startSec: voiced[segStart].tSec, endSec: voiced[voiced.length - 1].tSec });
    const ok = segs.filter((s) => s.endSec - s.startSec >= Math.max(0, minHoldSec));
    return ok.slice(0, maxRuns); // earliest-first, up to the number of expected notes
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
    /** NEW: how long the run must be held to be considered “captured” */
    minHoldSec?: number;
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
      ((args.melodyOnsetsSec?.length ?? 0) <= 1) &&
      (!args.rhythmOnsetsSec || args.rhythmOnsetsSec.length === 0);

    // Snapshot BEFORE alignment
    const rawSamples = args.snapshotSamples();

    // Choose evaluation phrase & window
    let phraseForEval: Phrase = args.phrase;
    let evalPhraseLenSec = args.phraseLengthOverrideSec ?? phraseWindowSec(args.phrase);

    // In timing-free: detect per-note runs and build a multi-note window.
    let extraOffsetSec: number | undefined = undefined;
    let beatsRawForAlign: number[] = [];
    let gestureLagForAlign = args.gestureLagSec;

    if (isTimingFree) {
      const minHold = Math.max(0.1, args.minHoldSec ?? 1);
      const wantNotes = Math.max(1, args.phrase?.notes?.length ?? 1);
      const runs = findSuccessfulRuns(rawSamples, opts.confMin, minHold, wantNotes);

      if (runs.length > 0) {
        // Eval phrase mirrors generated targets (midi per note),
        // with durations from detected runs and t=0 at first run start.
        phraseForEval = buildTimingFreeMultiPhrase(args.phrase, runs);
        evalPhraseLenSec = phraseForEval.durationSec;

        const firstStart = runs[0].startSec;
        extraOffsetSec = firstStart - args.leadInSec - args.pitchLagSec;

        // Gesture beats at each run start so alignment lands each note window correctly.
        beatsRawForAlign = runs.map((r) => r.startSec);

        // Make beat shifting identical to samples by using same lag for this align call.
        gestureLagForAlign = args.pitchLagSec;
      } else {
        // No held run long enough → keep a tiny single window to avoid NaNs.
        const fallbackLen = Math.max(0.5, minHold);
        phraseForEval = buildTimingFreePhrase(args.phrase, fallbackLen);
        evalPhraseLenSec = fallbackLen;
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
        keepPreRollSec: isTimingFree ? 0 : 0.5, // drop deep pre-voice negatives
        phraseLengthSec: evalPhraseLenSec,
        tailGuardSec: 0.25,
        pitchLagSec: args.pitchLagSec,
        gestureLagSec: gestureLagForAlign,
        extraOffsetSec, // only set in timing-free multi-run mode
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
