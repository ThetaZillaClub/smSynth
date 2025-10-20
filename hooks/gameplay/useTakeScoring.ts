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
 * Split voiced audio into sustained “runs”.
 * - Hard split on gaps
 * - Split on sustained pitch changes (sensitive)
 * - If we still have fewer runs than the phrase expects, force-split the longest run:
 *   • try a pitch-based split (sustained deviation), else
 *   • equal-time split (helps unison/P1 cases).
 */
const findSuccessfulRuns = (
  samples: PitchSample[],
  confMin: number,
  minHoldSec: number,
  wantNotes: number,
  maxGapSec = 0.12,
  changeCents = 40,          // more sensitive than old 60¢
  minChangeHoldSec = 0.05    // 50 ms sustain is enough to split
): Array<{ startSec: number; endSec: number }> => {
  const voiced = samples
    .filter((s) => (s.hz ?? 0) > 0 && (s.conf ?? 0) >= confMin)
    .sort((a, b) => a.tSec - b.tSec);
  if (!voiced.length || wantNotes <= 0) return [];

  // 1) First pass: split on gaps + sustained pitch change
  const rawRuns: Array<{ startIdx: number; endIdx: number }> = [];
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

  const segs = rawRuns
    .map(({ startIdx, endIdx }) => ({
      startSec: voiced[startIdx].tSec,
      endSec: voiced[endIdx].tSec,
      dur: Math.max(0, voiced[endIdx].tSec - voiced[startIdx].tSec),
      startIdx,
      endIdx,
    }))
    .filter((s) => s.dur >= Math.max(0, minHoldSec));

  // If we found enough, keep the longest K, but return in time order
  if (segs.length >= wantNotes) {
    return segs
      .slice()
      .sort((a, b) => b.dur - a.dur)
      .slice(0, wantNotes)
      .sort((a, b) => a.startSec - b.startSec)
      .map(({ startSec, endSec }) => ({ startSec, endSec }));
  }

  // 2) Not enough runs — try to split the longest one
  if (segs.length === 1 && wantNotes >= 2) {
    const run = segs[0];
    const slice = voiced.slice(run.startIdx, run.endIdx + 1);
    if (slice.length >= 4) {
      // Pitch-based split: look for a sustained deviation from the first half median
      const midIdx = Math.floor(slice.length / 2);
      const firstHalf = slice.slice(0, midIdx);
      const m0 = median(firstHalf.map((s) => hzToMidi(s.hz!)));

      const thr = changeCents / 100;
      let devStart: number | null = null;
      let splitByPitch: number | null = null;

      for (let i = midIdx; i < slice.length; i++) {
        const dev = Math.abs(hzToMidi(slice[i].hz!) - m0);
        if (dev >= thr) {
          if (devStart == null) devStart = i;
          const sustain = slice[i].tSec - slice[devStart].tSec;
          if (sustain >= minChangeHoldSec) {
            splitByPitch = slice[Math.max(run.startIdx, run.startIdx + devStart)].tSec;
            break;
          }
        } else {
          devStart = null;
        }
      }

      if (splitByPitch != null) {
        const a = { startSec: run.startSec, endSec: splitByPitch };
        const b = { startSec: splitByPitch, endSec: run.endSec };
        const okA = (a.endSec - a.startSec) >= Math.max(0.6 * minHoldSec, 0.2);
        const okB = (b.endSec - b.startSec) >= Math.max(0.6 * minHoldSec, 0.2);
        if (okA && okB) return [a, b];
      }
    }

    // Equal-time split fallback (handles unison/P1)
    const midT = (run.startSec + run.endSec) / 2;
    const a = { startSec: run.startSec, endSec: midT };
    const b = { startSec: midT, endSec: run.endSec };
    return [a, b];
  }

  // 3) Last-ditch: split overall voiced span equally if we have *some* audio
  if (!segs.length && wantNotes >= 2 && voiced.length >= 2) {
    const t0 = voiced[0].tSec;
    const t1 = voiced[voiced.length - 1].tSec;
    const mid = (t0 + t1) / 2;
    return [
      { startSec: t0, endSec: mid },
      { startSec: mid, endSec: t1 },
    ];
  }

  return segs.map(({ startSec, endSec }) => ({ startSec, endSec }));
};

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const ys = xs.slice().sort((a, b) => a - b);
  return ys[Math.floor(ys.length / 2)];
}

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

    const isTimingFree =
      ((args.melodyOnsetsSec?.length ?? 0) <= 1) &&
      (!args.rhythmOnsetsSec || args.rhythmOnsetsSec.length === 0);

    const rawSamples = args.snapshotSamples();

    let phraseForEval: Phrase = args.phrase;
    let evalPhraseLenSec = args.phraseLengthOverrideSec ?? phraseWindowSec(args.phrase);

    let extraOffsetSec: number | undefined = undefined;
    let beatsRawForAlign: number[] = [];
    let gestureLagForAlign = args.gestureLagSec;

    if (isTimingFree) {
      const minHold = Math.max(0.1, args.minHoldSec ?? 1);
      const wantNotes = Math.max(1, args.phrase?.notes?.length ?? 1);

      const runs = findSuccessfulRuns(rawSamples, opts.confMin, minHold, wantNotes);

      if (runs.length > 0) {
        phraseForEval = buildTimingFreeMultiPhrase(args.phrase, runs);
        evalPhraseLenSec = phraseForEval.durationSec;
        const firstStart = runs[0].startSec;
        extraOffsetSec = firstStart - args.leadInSec - args.pitchLagSec;
        beatsRawForAlign = runs.map((r) => r.startSec);
        gestureLagForAlign = args.pitchLagSec;
      } else {
        const fallbackLen = Math.max(0.5, minHold);
        phraseForEval = buildTimingFreePhrase(args.phrase, fallbackLen);
        evalPhraseLenSec = fallbackLen;
        beatsRawForAlign = [0];
      }
    } else {
      beatsRawForAlign = args.snapshotBeats();
    }

    const { samples, beats } = args.align(
      rawSamples,
      beatsRawForAlign,
      args.leadInSec,
      {
        keepPreRollSec: isTimingFree ? 0 : 0.5,
        phraseLengthSec: evalPhraseLenSec,
        tailGuardSec: 0.25,
        pitchLagSec: args.pitchLagSec,
        gestureLagSec: gestureLagForAlign,
        extraOffsetSec,
        devAssert: process.env.NODE_ENV !== "production",
        consolePrefix: "score-align",
      }
    );

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

    (score as any).__evalPhrase = phraseForEval;

    setLastScore(score);
    setSessionScores((s) => [...s, score]);
    return score;
  }, []);

  return {
    lastScore,
    sessionScores,
    scoreTake,
    resetScores,
  };
}
