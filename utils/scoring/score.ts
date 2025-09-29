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
    melodyPercent: number;       // 0..100 (coverage-based)
    melodyHitRate: number;       // 0..1 (any voicing in window)
    melodyMeanAbsMs: number;     // first voiced vs. notated onset
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
  onsetGraceMs?: number; // ignored time at the head of each note for eval/coverage
  maxAlignMs?: number;
  goodAlignMs?: number;  // full credit inside this band; smooth falloff to maxAlignMs
};

/* ---------------- main ---------------- */

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
    confMin = 0,
    centsOk = 50,
    onsetGraceMs = 120,
    maxAlignMs = 250,
    goodAlignMs = 120,
  } = options;

  /* ----- Pitch (unchanged) ----- */
  const voiced: PitchSample[] =
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
    const mae = centsAbs.length ? mean(centsAbs) : 120;

    perNote.push({ idx: i, timeOnPitch: goodSec, dur: evalDur, ratio, centsMae: mae });
    allCentsAbs.push(...centsAbs);
  }

  const timeOnPitchRatio = sumDur > 0 ? Math.min(1, sumOn / sumDur) : 0;
  let pitchPercent = 100 * timeOnPitchRatio;
  const centsMaeAll = allCentsAbs.length ? mean(allCentsAbs) : 120;
  if (pitchPercent > 98.5 && centsMaeAll < 12) pitchPercent = 100;

  /* ----- Rhythm ----- */

  // (A) Melody rhythm = voiced coverage inside each notated note window
  const mel = evalMelodyCoverageRhythm({
    notes: phrase.notes.map((n) => ({ startSec: n.startSec, durSec: n.durSec })),
    samples,
    confMin,
    onsetGraceMs,
    maxAlignMs,
  });

  // (B) Blue-line rhythm (gesture events vs. onsets) — soft grace + 1:1 pairing
  const line = evalHandLineRhythm({
    onsets: rhythmLineOnsetsSec,
    events: gestureEventsSec,
    maxAlignMs,
    goodAlignMs,
    unique: true,
  });

  const tracks = [mel, line].filter((t) => t.evaluated);
  const rhythmCombined = tracks.length
    ? tracks.reduce((a, t) => a + t.pct, 0) / tracks.length
    : 0;

  /* ----- Intervals (unchanged) ----- */
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

  /* ----- Final (harmonic mean) ----- */
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

function estimateAvgDt(samples: { tSec: number }[]): number {
  if (samples.length < 2) return 1 / 50;
  const total = samples[samples.length - 1].tSec - samples[0].tSec;
  return total > 0 ? total / (samples.length - 1) : 1 / 50;
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

/* -------- Rhythm subroutines -------- */

type RhythmEval = { pct: number; hitRate: number; meanAbs: number; evaluated: boolean };

/** Melody rhythm: voiced coverage in note windows (any voicing counts; pitch-agnostic). */
function evalMelodyCoverageRhythm({
  notes,
  samples,
  confMin,
  onsetGraceMs,
  maxAlignMs,
}: {
  notes: Array<{ startSec: number; durSec: number }>;
  samples: PitchSample[];
  confMin: number;
  onsetGraceMs: number;
  maxAlignMs: number;
}): RhythmEval {
  if (!notes.length) return { pct: 0, hitRate: 0, meanAbs: 0, evaluated: false };

  // Treat "voiced" as: upstream sets hz=null when unvoiced. If confMin>0, add a guard.
  const isVoiced = (s: PitchSample) =>
    (s.hz ?? 0) > 0 && (confMin > 0 ? s.conf >= confMin : true);

  const all = samples.slice().sort((a, b) => a.tSec - b.tSec);
  const voiced = all.filter(isVoiced);

  const globalDt = estimateAvgDt(voiced);
  const graceSec = Math.max(0, onsetGraceMs / 1000);

  let totalDur = 0;
  let totalVoiced = 0;
  let hits = 0;
  const absErrMs: number[] = [];

  for (const n of notes) {
    const t0 = n.startSec + graceSec;
    const t1 = n.startSec + n.durSec;
    const evalDur = Math.max(0, t1 - t0);
    if (evalDur <= 0) continue;

    totalDur += evalDur;

    const win = voiced.filter((s) => s.tSec >= t0 && s.tSec <= t1);

    if (win.length) {
      hits++;
      // timing error: first voiced sample vs notated onset (not the grace point)
      const first = win[0]!.tSec;
      absErrMs.push(Math.abs(first - n.startSec) * 1000);
    }

    const localDt = win.length ? estimateAvgDt(win) : globalDt;
    totalVoiced += Math.min(evalDur, (win.length || 0) * (localDt || 0));
  }

  const coverage = totalDur > 0 ? totalVoiced / totalDur : 0;
  const pct = clamp01(coverage) * 100;
  const hitRate = notes.length ? hits / notes.length : 0;
  const meanAbs = absErrMs.length ? mean(absErrMs) : maxAlignMs;

  return { pct, hitRate, meanAbs, evaluated: true };
}

/**
 * Hand/blue-line rhythm:
 * - one-to-one greedy pairing (each event matches at most one onset)
 * - full credit inside goodAlignMs; smooth 1.5-power falloff to maxAlignMs
 */
function evalHandLineRhythm({
  onsets,
  events,
  maxAlignMs,
  goodAlignMs = 0,
  unique = true,
}: {
  onsets?: number[];
  events: number[];
  maxAlignMs: number;
  goodAlignMs?: number;
  unique?: boolean;
}): RhythmEval {
  if (!onsets?.length) return { pct: 0, hitRate: 0, meanAbs: 0, evaluated: false };

  const exp = onsets.slice().sort((a, b) => a - b);
  const ev = events.slice().sort((a, b) => a - b);

  let hits = 0;
  const absErrMs: number[] = [];
  const scores: number[] = [];

  const safeGood = Math.max(0, goodAlignMs);
  const width = Math.max(1, maxAlignMs - safeGood); // avoid /0

  if (unique) {
    // Greedy one-to-one: consume each event at most once
    let j = 0;
    for (let i = 0; i < exp.length; i++) {
      const tExp = exp[i];
      if (j >= ev.length) { scores.push(0); continue; }

      // advance while next event is closer to this onset
      while (j + 1 < ev.length &&
             Math.abs(ev[j + 1] - tExp) <= Math.abs(ev[j] - tExp)) {
        j++;
      }

      const tNear = ev[j];
      const errMs = Math.abs((tNear - tExp) * 1000);

      let score = 0;
      if (errMs <= safeGood) {
        score = 1;
      } else if (errMs <= maxAlignMs) {
        const x = Math.min(1, (errMs - safeGood) / width);
        score = 1 - Math.pow(x, 1.5);
      } else {
        score = 0;
      }

      if (errMs <= maxAlignMs) {
        hits++;
        absErrMs.push(errMs);
      }
      scores.push(score);
      j++; // consume this event
    }
  } else {
    // Legacy nearest-with-reuse
    for (const tExp of exp) {
      const tNear = nearest(ev, tExp);
      const errMs = tNear == null ? Infinity : Math.abs((tNear - tExp) * 1000);
      let score = 0;
      if (errMs <= safeGood) {
        score = 1;
      } else if (errMs <= maxAlignMs) {
        const x = Math.min(1, (errMs - safeGood) / width);
        score = 1 - Math.pow(x, 1.5);
      } else {
        score = 0;
      }
      if (errMs <= maxAlignMs) { hits++; absErrMs.push(errMs); }
      scores.push(score);
    }
  }

  const pct = (scores.reduce((a, b) => a + b, 0) / (scores.length || 1)) * 100;
  const hitRate = exp.length ? hits / exp.length : 0;
  const meanAbs = absErrMs.length ? mean(absErrMs) : maxAlignMs;
  return { pct, hitRate, meanAbs, evaluated: true };
}

/* ------- small utils ------- */

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
