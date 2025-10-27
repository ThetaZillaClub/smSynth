// hooks/gameplay/useTakeScoring.ts
"use client";

import { useCallback, useState } from "react";
import { hzToMidi } from "@/utils/pitch/pitchMath";
import { computeTakeScore, type PitchSample, type TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { ScoringAlignmentOptions } from "@/hooks/gameplay/useScoringAlignment";

type AlignFn = (
  samplesRaw: PitchSample[] | null | undefined,
  beatsRaw: number[] | null | undefined,
  leadInSec: number | null | undefined,
  opts?: ScoringAlignmentOptions
) => { samples: PitchSample[]; beats: number[] };

type ScoreOptions = {
  confMin: number;
  centsOk: number;
  onsetGraceMs: number;
  maxAlignMs: number;
  goodAlignMs: number;
};

// ───────────────────────────────── helpers ───────────────────────────────────
const phraseWindowSec = (phrase: Phrase): number => {
  if (!phrase?.notes?.length) return phrase?.durationSec ?? 0;
  let end = 0;
  for (const n of phrase.notes) end = Math.max(end, n.startSec + n.durSec);
  return end;
};

const buildTimingFreePhrase = (src: Phrase, durSec: number): Phrase => {
  const midi = src?.notes?.[0]?.midi ?? 60;
  return { ...src, durationSec: durSec, notes: [{ midi, startSec: 0, durSec }] };
};

/**
 * Build an evaluation phrase from captured runs while PRESERVING real gaps
 * between runs. This is used ONLY in timing-free mode.
 *
 * We time-normalize so that the FIRST run begins at t=0, and keep each run’s
 * true offset relative to that start. Phrase.durationSec spans from the first
 * run’s start to the last run’s end (thus includes inter-run silence).
 */
const buildTimingFreeMultiPhrase = (
  src: Phrase,
  runs: Array<{ startSec: number; endSec: number }>
): Phrase => {
  const want = Math.max(1, src?.notes?.length ?? 1);
  const K = Math.min(runs.length, want);
  if (K === 0) return { ...src, durationSec: 0, notes: [] };

  const firstStart = runs[0].startSec;

  const notes = Array.from({ length: K }, (_, i) => {
    const r = runs[i]!;
    const startSec = Math.max(0, r.startSec - firstStart); // preserve inter-run gaps
    const durSec = Math.max(0, r.endSec - r.startSec);
    const midi = src?.notes?.[i]?.midi ?? src?.notes?.[0]?.midi ?? 60;
    return { midi, startSec, durSec };
  });

  const lastEnd = runs[K - 1]!.endSec;
  const durationSec = Math.max(0, lastEnd - firstStart);

  return { ...src, durationSec, notes };
};

/**
 * Split voiced audio into sustained “runs” for timing-free scoring.
 *  - Never resets on pauses (we keep earlier audio)
 *  - Caps each run to `capPerRunSec` (keeps long holds from dominating)
 */
const findSuccessfulRuns = (
  samples: PitchSample[],
  confMin: number,
  minHoldSec: number,
  wantNotes: number,
  opts?: {
    maxGapSec?: number;
    changeCents?: number;
    minChangeHoldSec?: number;
    resetOnPauseSec?: number;
    capPerRunSec?: number;
  }
): Array<{ startSec: number; endSec: number }> => {
  const maxGapSec = opts?.maxGapSec ?? 0.12;
  const changeCents = opts?.changeCents ?? 40;
  const minChangeHoldSec = opts?.minChangeHoldSec ?? 0.05;
  const resetOnPauseSec = opts?.resetOnPauseSec ?? 0;
  const capPerRunSec = Math.max(0, opts?.capPerRunSec ?? 0);

  // 0) confident voiced, sorted
  const voiced = samples
    .filter((s) => (s.hz ?? 0) > 0 && (s.conf ?? 0) >= confMin)
    .sort((a, b) => a.tSec - b.tSec);
  if (!voiced.length || wantNotes <= 0) return [];

  // 0.5) clear on last big pause (disabled when resetOnPauseSec === 0)
  if (resetOnPauseSec > 0) {
    let lastResetT: number | null = null;
    for (let i = 1; i < voiced.length; i++) {
      if (voiced[i].tSec - voiced[i - 1].tSec >= resetOnPauseSec) lastResetT = voiced[i].tSec;
    }
    if (lastResetT != null) {
      const cut = voiced.findIndex((s) => s.tSec >= lastResetT!);
      if (cut > 0) voiced.splice(0, cut);
    }
  }
  if (!voiced.length) return [];

  // 1) segment by gaps + sustained pitch change
  type RawSeg = { startIdx: number; endIdx: number };
  const rawRuns: RawSeg[] = [];
  let segStart = 0;
  let changeStart: number | null = null;
  let prevMidi = hzToMidi(voiced[0].hz!);

  for (let i = 1; i < voiced.length; i++) {
    const dt = voiced[i].tSec - voiced[i - 1].tSec;
    const midi = hzToMidi(voiced[i].hz!);

    if (dt > maxGapSec) {
      rawRuns.push({ startIdx: segStart, endIdx: i - 1 });
      segStart = i;
      changeStart = null;
      prevMidi = midi;
      continue;
    }

    const diffSemi = Math.abs(midi - prevMidi);
    if (diffSemi >= changeCents / 100) {
      if (changeStart == null) changeStart = i;
      const sustain = voiced[i].tSec - voiced[changeStart].tSec;
      if (sustain >= minChangeHoldSec) {
        const cut = Math.max(segStart, changeStart - 1);
        if (cut >= segStart) rawRuns.push({ startIdx: segStart, endIdx: cut });
        segStart = changeStart;
        changeStart = null;
      }
    } else {
      changeStart = null;
    }
    prevMidi = midi;
  }
  rawRuns.push({ startIdx: segStart, endIdx: voiced.length - 1 });

  type Seg = { startSec: number; endSec: number; dur: number };
  let segs: Seg[] = rawRuns.map(({ startIdx, endIdx }) => {
    const startSec = voiced[startIdx].tSec;
    const endSec = voiced[endIdx].tSec;
    return { startSec, endSec, dur: Math.max(0, endSec - startSec) };
  });

  // 2) enforce min hold and cap per-run
  segs = segs.filter((s) => s.dur >= Math.max(0, minHoldSec));
  if (capPerRunSec > 0) {
    segs = segs
      .map((s) => {
        const end = Math.min(s.endSec, s.startSec + capPerRunSec);
        return { ...s, endSec: end, dur: Math.max(0, end - s.startSec) };
      })
      .filter((s) => s.dur >= Math.max(0, minHoldSec));
  }

  // 3) earliest K runs
  if (segs.length >= wantNotes) {
    return segs
      .slice()
      .sort((a, b) => a.startSec - b.startSec)
      .slice(0, wantNotes)
      .map(({ startSec, endSec }) => ({ startSec, endSec }));
  }

  // 4) simple split if only one run but want ≥2
  if (segs.length === 1 && wantNotes >= 2) {
    const s = segs[0];
    const mid = (s.startSec + s.endSec) / 2;
    const a = { startSec: s.startSec, endSec: Math.min(mid, s.startSec + (capPerRunSec || mid - s.startSec)) };
    const b = { startSec: Math.max(a.endSec, mid), endSec: s.endSec };
    const ok = (r: { startSec: number; endSec: number }) =>
      r.endSec - r.startSec >= Math.max(0.6 * minHoldSec, 0.2);
    const cands = [a, b].filter(ok);
    if (cands.length) return cands.slice(0, wantNotes);
  }

  // 5) return whatever’s valid in time order
  return segs
    .slice()
    .sort((a, b) => a.startSec - b.startSec)
    .map(({ startSec, endSec }) => ({ startSec, endSec }));
};

// ───────────────────────────────── hook ──────────────────────────────────────
export default function useTakeScoring() {
  const [lastScore, setLastScore] = useState<TakeScore | null>(null);
  const [sessionScores, setSessionScores] = useState<TakeScore[]>([]);

  const resetScores = useCallback(() => {
    setLastScore(null);
    setSessionScores([]);
  }, []);

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
    optionsOverride?: Partial<ScoreOptions>;
    /** When true, force timing-free path from session config (e.g., Intervals course). */
    timingFreeResponse?: boolean;
    /** Optional per-note capture requirement (seconds). Also implies timing-free if set. */
    minHoldSec?: number;
  }) => {
    const defaults: ScoreOptions = {
      confMin: 0.5,
      centsOk: 60,
      onsetGraceMs: 100,
      maxAlignMs: 250,
      goodAlignMs: 120,
    };
    const opts: ScoreOptions = { ...defaults, ...(args.optionsOverride ?? {}) };

    // Source of truth: session-config trigger (Intervals sets timingFreeResponse: true)
    const sessionSaysTimingFree = !!args.timingFreeResponse;
    // Only treat hints as "on" when they are meaningfully > 0
    const timingFreeHint =
      (typeof args.minHoldSec === "number" && (args.minHoldSec ?? 0) > 0) ||
      (typeof args.phraseLengthOverrideSec === "number" && (args.phraseLengthOverrideSec ?? 0) > 0);

    const isTimingFree =
      sessionSaysTimingFree ||
      timingFreeHint ||
      (((args.melodyOnsetsSec?.length ?? 0) <= 1) &&
        (!args.rhythmOnsetsSec || args.rhythmOnsetsSec.length === 0));

    const rawSamples = args.snapshotSamples();

    let phraseForEval: Phrase = args.phrase;
    let evalPhraseLenSec = args.phraseLengthOverrideSec ?? phraseWindowSec(args.phrase);

    let extraOffsetSec: number | undefined = undefined;
    let beatsRawForAlign: number[] = [];
    let gestureLagForAlign = args.gestureLagSec;

    if (isTimingFree) {
      const minHold = Math.max(0.1, args.minHoldSec ?? 1);
      const wantNotes = Math.max(1, args.phrase?.notes?.length ?? 1);

      // More forgiving run detection; never reset, generous caps
      const runs = findSuccessfulRuns(
        rawSamples,
        Math.min(opts.confMin, 0.5),
        minHold,
        wantNotes,
        {
          maxGapSec: 0.20,
          changeCents: 35,
          minChangeHoldSec: 0.04,
          resetOnPauseSec: 0,
          capPerRunSec: 15,
        }
      );

      if (runs.length > 0) {
        // Build eval phrase from actual captured windows, preserving gaps (timing-free only)
        phraseForEval = buildTimingFreeMultiPhrase(args.phrase, runs);
        evalPhraseLenSec = phraseForEval.durationSec;

        const firstStart = runs[0].startSec;
        // Anchor so first run aligns to t=0 post-align, regardless of when user started
        extraOffsetSec = firstStart - args.leadInSec - args.pitchLagSec;

        // Use *eval phrase* onsets (== run starts, gap-preserved) for alignment/segmentation
        beatsRawForAlign = phraseForEval.notes.map((n) => n.startSec);

        // Glue gesture timing to pitch timing for timing-free mode
        gestureLagForAlign = args.pitchLagSec;
      } else {
        // Nothing confidently captured: score a single short window so we don’t 0% by grid timing
        const fallbackLen = Math.max(0.5, minHold);
        phraseForEval = buildTimingFreePhrase(args.phrase, fallbackLen);
        evalPhraseLenSec = fallbackLen;
        beatsRawForAlign = [0];
      }
    } else {
      // Regular timed flow — unchanged
      beatsRawForAlign = args.snapshotBeats();
    }

    const { samples, beats } = args.align(
      rawSamples,
      beatsRawForAlign,
      args.leadInSec,
      {
        // small pre-roll keeps us safe from tiny offset jitter when singing late
        keepPreRollSec: isTimingFree ? 0.3 : 0.5,
        phraseLengthSec: evalPhraseLenSec,
        tailGuardSec: 0.35,
        pitchLagSec: args.pitchLagSec,
        gestureLagSec: gestureLagForAlign,
        extraOffsetSec,
        devAssert: process.env.NODE_ENV !== "production",
        consolePrefix: "score-align",
      }
    );

    // For timing-free, mask to the union of eval windows — with a small edge margin and tolerant fallback.
    const samplesForScoring: PitchSample[] = (() => {
      if (!isTimingFree) return samples;

      const marginSec = 0.12; // ±120ms guard against alignment jitter
      const windows = (phraseForEval?.notes ?? []).map(n => ([
        Math.max(0, n.startSec - marginSec),
        n.startSec + n.durSec + marginSec
      ] as const));
      const inAny = (t: number) => windows.some(([a, b]) => t >= a && t <= b);

      // Strict → relaxed → voiced fallback
      const strict = samples.filter(
        (s) => inAny(s.tSec) && (s.hz ?? 0) > 0 && (s.conf ?? 0) >= opts.confMin
      );
      if (strict.length) return strict;

      const relaxedConf = Math.min(0.35, opts.confMin);
      const relaxed = samples.filter(
        (s) => inAny(s.tSec) && (s.hz ?? 0) > 0 && (s.conf ?? 0) >= relaxedConf
      );
      if (relaxed.length) return relaxed;

      return samples.filter((s) => inAny(s.tSec) && (s.hz ?? 0) > 0);
    })();

    const evalOnsets = phraseForEval.notes.map((n) => n.startSec);

    const score = computeTakeScore({
      phrase: phraseForEval,
      bpm: args.bpm,
      den: args.den,
      samples: samplesForScoring,
      // Use aligned beats as segmentation (equals evalOnsets)
      gestureEventsSec: beats,
      // And also tell the scorer the same onsets for melody; no musical grid
      melodyOnsetsSec: isTimingFree ? evalOnsets : args.melodyOnsetsSec,
      // No rhythm-line in timing-free
      rhythmLineOnsetsSec: isTimingFree ? undefined : args.rhythmOnsetsSec ?? undefined,
      options: {
        confMin: opts.confMin,
        centsOk: opts.centsOk,
        onsetGraceMs: opts.onsetGraceMs,
        maxAlignMs: opts.maxAlignMs,
        goodAlignMs: opts.goodAlignMs,
      },
    });

    // Store the actual eval phrase for analytics
    (score as any).__evalPhrase = phraseForEval;

    setLastScore(score);
    setSessionScores((s) => [...s, score]);
    return score;
  }, []);

  return { lastScore, sessionScores, scoreTake, resetScores };
}
