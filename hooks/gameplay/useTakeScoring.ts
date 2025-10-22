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
 * Split voiced audio into sustained “runs” suitable for timing-free scoring.
 * Changes vs. previous behavior:
 *  - We can "reset" on a pause: if a gap >= resetOnPauseSec occurs, we drop everything
 *    before the *last* such gap.
 *  - Each run can be capped to a fixed duration (e.g., minHoldSec), so long holds
 *    do not inflate the score.
 *  - When we have enough runs, we pick the *earliest* K in time order (not the longest).
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
    /** if a gap >= this, drop everything before the last such gap */
    resetOnPauseSec?: number; // e.g., 0.35–0.50
    /** hard cap per-note duration to be *scored* */
    capPerRunSec?: number; // e.g., minHoldSec
  }
): Array<{ startSec: number; endSec: number }> => {
  const maxGapSec = opts?.maxGapSec ?? 0.12;
  const changeCents = opts?.changeCents ?? 40;
  const minChangeHoldSec = opts?.minChangeHoldSec ?? 0.05;
  const resetOnPauseSec = opts?.resetOnPauseSec ?? 0;
  const capPerRunSec = Math.max(0, opts?.capPerRunSec ?? 0);

  // 0) Keep only confident voiced, sorted
  const voiced = samples
    .filter((s) => (s.hz ?? 0) > 0 && (s.conf ?? 0) >= confMin)
    .sort((a, b) => a.tSec - b.tSec);
  if (!voiced.length || wantNotes <= 0) return [];

  // 0.5) "Clear on pause": drop everything before the *last* big gap
  if (resetOnPauseSec > 0) {
    let lastResetT: number | null = null;
    for (let i = 1; i < voiced.length; i++) {
      if (voiced[i].tSec - voiced[i - 1].tSec >= resetOnPauseSec) {
        lastResetT = voiced[i].tSec;
      }
    }
    if (lastResetT != null) {
      const cut = voiced.findIndex((s) => s.tSec >= lastResetT!);
      if (cut > 0) voiced.splice(0, cut);
    }
  }
  if (!voiced.length) return [];

  // 1) Split on natural gaps + sustained pitch change
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

  type Seg = { startIdx: number; endIdx: number; startSec: number; endSec: number; dur: number };
  let segs: Seg[] = rawRuns.map(({ startIdx, endIdx }) => {
    const startSec = voiced[startIdx].tSec;
    const endSec = voiced[endIdx].tSec;
    return { startIdx, endIdx, startSec, endSec, dur: Math.max(0, endSec - startSec) };
  });

  // 2) Filter by minimum captured hold
  segs = segs.filter((s) => s.dur >= Math.max(0, minHoldSec));

  // 2.5) Cap each run to the captured window (so long holds don't inflate score)
  if (capPerRunSec > 0) {
    segs = segs
      .map((s) => {
        const cappedEnd = Math.min(s.endSec, s.startSec + capPerRunSec);
        return { ...s, endSec: cappedEnd, dur: Math.max(0, cappedEnd - s.startSec) };
      })
      .filter((s) => s.dur >= Math.max(0, minHoldSec));
  }

  // 3) If enough, take the earliest K in time order (not the longest)
  if (segs.length >= wantNotes) {
    return segs
      .slice()
      .sort((a, b) => a.startSec - b.startSec)
      .slice(0, wantNotes)
      .map(({ startSec, endSec }) => ({ startSec, endSec }));
  }

  // 4) Not enough runs — try to split the *longest* one sensibly
  if (segs.length === 1 && wantNotes >= 2) {
    // Find the longest original segment (pre-cap) to attempt a smart split
    const longest = rawRuns
      .map(({ startIdx, endIdx }) => {
        const startSec = voiced[startIdx].tSec;
        const endSec = voiced[endIdx].tSec;
        return { startIdx, endIdx, startSec, endSec, dur: Math.max(0, endSec - startSec) };
      })
      .sort((a, b) => b.dur - a.dur)[0];

    if (longest) {
      const slice = voiced.slice(longest.startIdx, longest.endIdx + 1);
      if (slice.length >= 4) {
        // Pitch-based split: sustained deviation from first-half median
        const midIdx = Math.floor(slice.length / 2);
        const firstHalf = slice.slice(0, midIdx);
        const m0 = median(firstHalf.map((s) => hzToMidi(s.hz!)));
        const thr = changeCents / 100;

        let devStart: number | null = null;
        let splitT: number | null = null;

        for (let i = midIdx; i < slice.length; i++) {
          const dev = Math.abs(hzToMidi(slice[i].hz!) - m0);
          if (dev >= thr) {
            if (devStart == null) devStart = i;
            const sustain = slice[i].tSec - slice[devStart].tSec;
            if (sustain >= minChangeHoldSec) {
              splitT = slice[devStart].tSec;
              break;
            }
          } else {
            devStart = null;
          }
        }

        if (splitT != null) {
          const a = { startSec: longest.startSec, endSec: splitT };
          const b = { startSec: splitT, endSec: longest.endSec };
          const okA = a.endSec - a.startSec >= Math.max(0.6 * minHoldSec, 0.2);
          const okB = b.endSec - b.startSec >= Math.max(0.6 * minHoldSec, 0.2);
          if (okA && okB) {
            const capped = [a, b].map((r) => ({
              startSec: r.startSec,
              endSec: capPerRunSec > 0 ? Math.min(r.startSec + capPerRunSec, r.endSec) : r.endSec,
            }));
            return capped.slice(0, wantNotes);
          }
        }
      }
      // Equal-time split fallback
      const midT = (longest.startSec + longest.endSec) / 2;
      const a = { startSec: longest.startSec, endSec: midT };
      const b = { startSec: midT, endSec: longest.endSec };
      const fixed = [a, b]
        .map((r) => ({
          startSec: r.startSec,
          endSec: capPerRunSec > 0 ? Math.min(r.startSec + capPerRunSec, r.endSec) : r.endSec,
        }))
        .filter((r) => r.endSec - r.startSec >= Math.max(0.6 * minHoldSec, 0.2));
      if (fixed.length) return fixed.slice(0, wantNotes);
    }
  }

  // 5) Last-ditch: split overall voiced span equally
  if (!segs.length && wantNotes >= 2 && voiced.length >= 2) {
    const t0 = voiced[0].tSec;
    const t1 = voiced[voiced.length - 1].tSec;
    const mid = (t0 + t1) / 2;
    const a0 = { startSec: t0, endSec: Math.min(t1, t0 + Math.max(minHoldSec, 0.2)) };
    const b0 = { startSec: Math.max(a0.endSec, mid), endSec: t1 };
    const capped = [a0, b0]
      .map((r) => ({
        startSec: r.startSec,
        endSec: capPerRunSec > 0 ? Math.min(r.startSec + capPerRunSec, r.endSec) : r.endSec,
      }))
      .filter((r) => r.endSec - r.startSec >= Math.max(0.6 * minHoldSec, 0.2));
    return capped.slice(0, wantNotes);
  }

  // 6) Return whatever we have (time order)
  return segs
    .slice()
    .sort((a, b) => a.startSec - b.startSec)
    .map(({ startSec, endSec }) => ({ startSec, endSec }));
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

      // Only score the captured hold window, and clear on pauses ≥ 350 ms
      const runs = findSuccessfulRuns(rawSamples, opts.confMin, minHold, wantNotes, {
        resetOnPauseSec: 0.35,  // tweak 0.3–0.5 to taste
        capPerRunSec: minHold,  // score exactly the captured hold
      });

      if (runs.length > 0) {
        phraseForEval = buildTimingFreeMultiPhrase(args.phrase, runs);
        evalPhraseLenSec = phraseForEval.durationSec;

        const firstStart = runs[0].startSec;
        // Shift both streams so that the first scored run starts at t=0 post-align
        extraOffsetSec = firstStart - args.leadInSec - args.pitchLagSec;

        // Beats for alignment: anchor each run start (gesture stream follows same anchor)
        beatsRawForAlign = runs.map((r) => r.startSec);

        // For timing-free, keep gesture aligned with pitch lag so both streams move together
        gestureLagForAlign = args.pitchLagSec;
      } else {
        // Fallback: single short window equal to minHold
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
