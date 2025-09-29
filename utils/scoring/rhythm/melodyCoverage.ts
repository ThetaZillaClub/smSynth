// utils/scoring/rhythm/melodyCoverage.ts
import type { PitchSample, RhythmEval } from "../types";
import { estimateAvgDt, clamp01, mean } from "../helpers";

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
}): RhythmEval {
  if (!notes.length) return { pct: 0, hitRate: 0, meanAbs: 0, evaluated: false };

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
      const first = win[0]!.tSec; // first voiced vs notated onset
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
