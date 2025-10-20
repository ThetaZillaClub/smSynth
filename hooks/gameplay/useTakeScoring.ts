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

// Pitch-aware run splitter: splits on gaps *and* sustained pitch changes
const findSuccessfulRuns = (
  samples: PitchSample[],
  confMin: number,
  minHoldSec: number,
  maxRuns: number,
  maxGapSec = 0.12,
  changeCents = 60,          // split when jump ≳ 60¢ and it sustains briefly
  minChangeHoldSec = 0.06    // new pitch must persist ≥ 60ms
): Array<{ startSec: number; endSec: number }> => {
  const voiced = samples
    .filter((s) => (s.hz ?? 0) > 0 && (s.conf ?? 0) >= confMin)
    .sort((a, b) => a.tSec - b.tSec);
  if (!voiced.length || maxRuns <= 0) return [];

  const runs: Array<{ startIdx: number; endIdx: number }> = [];
  let segStart = 0;
  let changeStart: number | null = null;
  let prevMidi = hzToMidi(voiced[0].hz!);

  for (let i = 1; i < voiced.length; i++) {
    const dt = voiced[i].tSec - voiced[i - 1].tSec;
    const midi = hzToMidi(voiced[i].hz!);

    // hard split on gaps
    if (dt > maxGapSec) {
      runs.push({ startIdx: segStart, endIdx: i - 1 });
      segStart = i;
      changeStart = null;
      prevMidi = midi;
      continue;
    }

    // watch for a sustained pitch jump
    const diffSemi = Math.abs(midi - prevMidi);
    if (diffSemi >= changeCents / 100) {
      if (changeStart == null) changeStart = i;
      const sustain = voiced[i].tSec - voiced[changeStart].tSec;
      if (sustain >= minChangeHoldSec) {
        // close previous segment right before the change region
        const cut = Math.max(segStart, changeStart - 1);
        if (cut >= segStart) runs.push({ startIdx: segStart, endIdx: cut });
        segStart = changeStart;
        changeStart = null;
      }
    } else {
      changeStart = null;
    }

    prevMidi = midi;
  }
  // close last
  runs.push({ startIdx: segStart, endIdx: voiced.length - 1 });

  // map to times, filter by hold, limit to K longest (keep chronological order)
  const segs = runs
    .map(({ startIdx, endIdx }) => ({
      startSec: voiced[startIdx].tSec,
      endSec: voiced[endIdx].tSec,
      dur: Math.max(0, voiced[endIdx].tSec - voiced[startIdx].tSec),
    }))
    .filter((s) => s.dur >= Math.max(0, minHoldSec));

  if (segs.length <= maxRuns) return segs;

  // take the longest K, but return in time order
  const picked = segs
    .slice()
    .sort((a, b) => b.dur - a.dur)
    .slice(0, maxRuns)
    .sort((a, b) => a.startSec - b.startSec)
    .map(({ startSec, endSec }) => ({ startSec, endSec }));

  return picked;
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
