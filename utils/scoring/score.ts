// utils/scoring/score.ts
import type { Phrase } from "@/utils/stage";
import { midiToHz, hzToMidi, centsBetweenHz } from "@/utils/pitch/pitchMath";
import { letterFromPercent } from "./grade";

export type PitchSample = { tSec: number; hz: number | null; conf: number };

export type TakeScore = {
  pitch: {
    percent: number;             // 0..100
    timeOnPitchRatio: number;    // 0..1
    centsMae: number;            // mean absolute cents (voiced)
    perNote: Array<{
      idx: number;
      timeOnPitch: number;
      dur: number;
      ratio: number;
      centsMae: number;
    }>;
  };
  rhythm: {
    melodyPercent: number;       // 0..100
    melodyHitRate: number;       // 0..1
    melodyMeanAbsMs: number;
    lineEvaluated: boolean;
    linePercent: number;
    lineHitRate: number;
    lineMeanAbsMs: number;
    combinedPercent: number;     // average of evaluated rhythm tracks
  };
  intervals: {
    total: number;
    correct: number;
    correctRatio: number;        // 0..1
  };
  final: {
    percent: number;             // 0..100
    letter: string;
  };
};

type Options = {
  /**
   * Optional extra confidence gate during scoring.
   * Default 0 to avoid re-gating; we rely on upstream to set hz=null for unvoiced.
   */
  confMin?: number;
  centsOk?: number;
  onsetGraceMs?: number;
  maxAlignMs?: number;
  goodAlignMs?: number;
};

export function computeTakeScore({
  phrase,
  bpm, den, // den kept for future use
  samples,
  gestureEventsSec,
  melodyOnsetsSec,
  rhythmLineOnsetsSec,
  options = {},
}: {
  phrase: Phrase;
  bpm: number;
  den: number;
  samples: PitchSample[];
  gestureEventsSec: number[];
  melodyOnsetsSec: number[];
  rhythmLineOnsetsSec?: number[];
  options?: Options;
}): TakeScore {
  const {
    // 👇 default to 0: treat confidence purely as voicing upstream (hz=null below model threshold)
    confMin = 0,
    centsOk = 50,
    onsetGraceMs = 120,
    maxAlignMs = 250,
    goodAlignMs = 120,
  } = options;

  // ----- Pitch -----
  // If confMin > 0, allow an extra safety gate; otherwise accept all voiced (hz>0) samples.
  const voiced =
    confMin > 0
      ? samples.filter((s) => (s.hz ?? 0) > 0 && s.conf >= confMin)
      : samples.filter((s) => (s.hz ?? 0) > 0);

  const perNote: TakeScore["pitch"]["perNote"] = [];
  let sumOn = 0, sumDur = 0, allCentsAbs: number[] = [];

  for (let i = 0; i < phrase.notes.length; i++) {
    const n = phrase.notes[i];
    const start = n.startSec + onsetGraceMs / 1000;
    const end   = n.startSec + n.durSec;
    const sw = voiced.filter((s) => s.tSec >= start && s.tSec <= end);
    const step = estimateAvgDt(sw);
    const targetHz = midiToHz(n.midi);
    let goodSec = 0;
    const centsAbs: number[] = [];

    for (const s of sw) {
      const cents = centsBetweenHz(s.hz!, targetHz);
      centsAbs.push(Math.abs(cents));
      if (Math.abs(cents) <= centsOk) goodSec += step;
    }

    const evalDur = Math.max(0, end - start);
    const ratio = evalDur > 0 ? Math.min(1, goodSec / evalDur) : 0;
    sumOn += goodSec;
    sumDur += evalDur;
    const mae = centsAbs.length ? centsAbs.reduce((a,b)=>a+b,0) / centsAbs.length : 120;

    perNote.push({ idx: i, timeOnPitch: goodSec, dur: evalDur, ratio, centsMae: mae });
    allCentsAbs.push(...centsAbs);
  }

  const timeOnPitchRatio = sumDur > 0 ? Math.min(1, sumOn / sumDur) : 0;
  let pitchPercent = 100 * timeOnPitchRatio;
  const centsMaeAll = allCentsAbs.length ? (allCentsAbs.reduce((a,b)=>a+b,0)/allCentsAbs.length) : 120;
  if (pitchPercent > 98.5 && centsMaeAll < 12) pitchPercent = 100;

  // ----- Rhythm -----
  const evalRhythm = (onsets?: number[]) => {
    if (!onsets?.length) return { pct: 0, hitRate: 0, meanAbs: 0, evaluated: false };
    const ev = gestureEventsSec.slice().sort((a,b)=>a-b);
    let hits = 0;
    const absErr: number[] = [];
    const scores: number[] = [];

    for (const tExp of onsets) {
      const tNear = nearest(ev, tExp);
      const err = tNear == null ? Infinity : Math.abs((tNear - tExp) * 1000);
      if (err <= maxAlignMs) {
        hits++;
        absErr.push(err);
        const x = Math.min(1, err / maxAlignMs);
        const shaped = 1 - Math.pow(x, 1.5);
        scores.push(shaped);
      } else {
        scores.push(0);
      }
    }
    const pct = (scores.reduce((a,b)=>a+b,0) / (scores.length || 1)) * 100;
    const meanAbs = absErr.length ? absErr.reduce((a,b)=>a+b,0) / absErr.length : maxAlignMs;
    return { pct, hitRate: hits / (onsets.length || 1), meanAbs, evaluated: true };
  };

  const mel = evalRhythm(melodyOnsetsSec);
  const line = evalRhythm(rhythmLineOnsetsSec);
  const tracks = [mel, line].filter(t => t.evaluated);
  const rhythmCombined = tracks.length
    ? tracks.reduce((a, t) => a + t.pct, 0) / tracks.length
    : 0;

  // ----- Intervals -----
  const intervalEval = (() => {
    if (phrase.notes.length < 2) return { total: 0, correct: 0, correctRatio: 1 };
    const mids: number[] = phrase.notes.map((n) =>
      medianMidiInRange(voiced, n.startSec, n.startSec + n.durSec)
    );
    let correct = 0, total = 0;
    for (let i = 1; i < phrase.notes.length; i++) {
      if (!isFinite(mids[i-1]) || !isFinite(mids[i])) continue;
      const exp = phrase.notes[i].midi - phrase.notes[i-1].midi;
      const got = mids[i] - mids[i-1];
      const errCents = 100 * (got - exp);
      if (Math.abs(errCents) <= 50) correct++;
      total++;
    }
    return { total, correct, correctRatio: total ? correct / total : 1 };
  })();

  // ----- Final (harmonic mean encourages balance) -----
  const rhythmPct = rhythmCombined;
  let finalPct =
    (pitchPercent > 0 && rhythmPct > 0)
      ? (2 * pitchPercent * rhythmPct) / (pitchPercent + rhythmPct)
      : Math.max(pitchPercent, rhythmPct);

  if (pitchPercent >= 98 && rhythmPct >= 98) finalPct = 100;

  return {
    pitch: {
      percent: Math.max(0, Math.min(100, pitchPercent)),
      timeOnPitchRatio,
      centsMae: centsMaeAll,
      perNote,
    },
    rhythm: {
      melodyPercent: mel.pct,
      melodyHitRate: mel.hitRate,
      melodyMeanAbsMs: mel.meanAbs,
      lineEvaluated: line.evaluated,
      linePercent: line.pct,
      lineHitRate: line.hitRate,
      lineMeanAbsMs: line.meanAbs,
      combinedPercent: rhythmPct,
    },
    intervals: intervalEval,
    final: {
      percent: Math.max(0, Math.min(100, finalPct)),
      letter: letterFromPercent(finalPct),
    },
  };
}

/* ---------------- helpers ---------------- */

function estimateAvgDt(samples: PitchSample[]): number {
  if (samples.length < 2) return 1/50;
  const total = samples[samples.length - 1].tSec - samples[0].tSec;
  return total > 0 ? total / (samples.length - 1) : 1/50;
}

function nearest(arr: number[], x: number): number | null {
  if (!arr.length) return null;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  const a = arr[lo];
  const b = lo > 0 ? arr[lo - 1] : null;
  if (b == null) return a;
  return Math.abs(b - x) < Math.abs(a - x) ? b : a;
}

function medianMidiInRange(samples: PitchSample[], t0: number, t1: number): number {
  const S = samples.filter((s) => s.tSec >= t0 && s.tSec <= t1 && (s.hz ?? 0) > 0);
  if (!S.length) return NaN;
  const mids = S.map((s) => hzToMidi(s.hz!)).filter(Number.isFinite).sort((a,b)=>a-b);
  return mids[Math.floor(mids.length / 2)];
}
