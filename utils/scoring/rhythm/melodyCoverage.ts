import type { PitchSample, PerNoteRhythm } from "../types";
import { estimateAvgDt, clamp01, mean } from "../helpers";

type RhythmSummary = {
  pct: number;       // 0..100 (coverage-based)
  hitRate: number;   // 0..1 (any voicing in window)
  meanAbs: number;   // ms — first voiced vs notated onset
  evaluated: boolean;
};

/**
 * Melody rhythm via coverage, with onset error measured from the true notated start.
 * - Coverage ignores an initial grace (onsetGraceMs)
 * - Onset error is computed from the earliest voiced sample >= note.startSec (no grace)
 */
export function evalMelodyCoverageRhythm({
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
}): { summary: RhythmSummary; perNote: PerNoteRhythm[] } {
  if (!notes.length) {
    return {
      summary: { pct: 0, hitRate: 0, meanAbs: 0, evaluated: false },
      perNote: [],
    };
  }

  const isVoiced = (s: PitchSample) =>
    (s.hz ?? 0) > 0 && (confMin > 0 ? (s.conf ?? 0) >= confMin : true);

  const all = samples.slice().sort((a, b) => a.tSec - b.tSec);
  const voiced = all.filter(isVoiced);
  const globalDt = estimateAvgDt(voiced);
  const graceSec = Math.max(0, onsetGraceMs / 1000);

  // If you want to allow slightly-early onsets (negative Δt) to be counted in meanAbs,
  // set this > 0 (e.g., 0.04 for 40 ms). Keep 0 to avoid early lookback.
  const ONSET_LOOKBACK_SEC = 0;

  let totalDur = 0;
  let totalVoiced = 0;
  let hits = 0;
  const absErrMs: number[] = [];
  const perNote: PerNoteRhythm[] = [];

  for (let idx = 0; idx < notes.length; idx++) {
    const n = notes[idx];

    // Coverage window uses grace at the head
    const cov0 = n.startSec + graceSec;
    const cov1 = n.startSec + n.durSec;
    const evalDur = Math.max(0, cov1 - cov0);

    if (evalDur <= 0) {
      perNote.push({ idx, dur: 0, voicedSec: 0, coverage: 0, onsetErrMs: null });
      continue;
    }

    totalDur += evalDur;

    // Samples inside the coverage window (for coverage + hit flag)
    const win = voiced.filter((s) => s.tSec >= cov0 && s.tSec <= cov1);

    // First voiced sample from the true note start (no grace), optionally with a small lookback
    const earliestStart = Math.max(0, n.startSec - ONSET_LOOKBACK_SEC);
    const firstFromStart = voiced.find((s) => s.tSec >= earliestStart && s.tSec <= cov1) || null;

    let onsetErr: number | null = null;

    // "Hit" means any voicing inside the coverage window (keeps previous semantics)
    if (win.length) {
      hits++;
      if (firstFromStart) {
        onsetErr = (firstFromStart.tSec - n.startSec) * 1000;
        absErrMs.push(Math.abs(onsetErr));
      }
    }

    const localDt = win.length ? estimateAvgDt(win) : globalDt;
    const voicedSec = Math.min(evalDur, (win.length || 0) * (localDt || 0));
    totalVoiced += voicedSec;

    const coverage = evalDur > 0 ? voicedSec / evalDur : 0;
    perNote.push({ idx, dur: evalDur, voicedSec, coverage, onsetErrMs: onsetErr });
  }

  const coverage = totalDur > 0 ? totalVoiced / totalDur : 0;
  const pct = clamp01(coverage) * 100;
  const hitRate = notes.length ? hits / notes.length : 0;
  const meanAbs = absErrMs.length ? mean(absErrMs) : maxAlignMs;

  return {
    summary: { pct, hitRate, meanAbs, evaluated: true },
    perNote,
  };
}
