import type { PitchSample, PerNoteRhythm } from "../types";
import { estimateAvgDt, clamp01, mean } from "../helpers";

type RhythmSummary = {
  pct: number;       // 0..100 (coverage-based)
  hitRate: number;   // 0..1 (any voicing in window)
  meanAbs: number;   // ms — first voiced vs notated onset
  evaluated: boolean;
};

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

  let totalDur = 0;
  let totalVoiced = 0;
  let hits = 0;
  const absErrMs: number[] = [];
  const perNote: PerNoteRhythm[] = [];

  for (let idx = 0; idx < notes.length; idx++) {
    const n = notes[idx];
    const t0 = n.startSec + graceSec;
    const t1 = n.startSec + n.durSec;
    const evalDur = Math.max(0, t1 - t0);

    if (evalDur <= 0) {
      perNote.push({ idx, dur: 0, voicedSec: 0, coverage: 0, onsetErrMs: null });
      continue;
    }

    totalDur += evalDur;
    const win = voiced.filter((s) => s.tSec >= t0 && s.tSec <= t1);

    let onsetErr: number | null = null;
    if (win.length) {
      hits++;
      const first = win[0]!.tSec;
      onsetErr = (first - n.startSec) * 1000;
      absErrMs.push(Math.abs(onsetErr));
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
