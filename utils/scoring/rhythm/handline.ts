// utils/scoring/rhythm/handLine.ts
import type { RhythmEval } from "../types";
import { nearest, mean } from "../helpers";

export function evalHandLineRhythm({
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
    let j = 0;
    for (let i = 0; i < exp.length; i++) {
      const tExp = exp[i];
      if (j >= ev.length) { scores.push(0); continue; }

      while (j + 1 < ev.length &&
             Math.abs(ev[j + 1] - tExp) <= Math.abs(ev[j] - tExp)) {
        j++;
      }

      const tNear = ev[j];
      const errMs = Math.abs((tNear - tExp) * 1000);

      let score = 0;
      if (errMs <= safeGood) score = 1;
      else if (errMs <= maxAlignMs) {
        const x = Math.min(1, (errMs - safeGood) / width);
        score = 1 - Math.pow(x, 1.5);
      }

      if (errMs <= maxAlignMs) { hits++; absErrMs.push(errMs); }
      scores.push(score);
      j++;
    }
  } else {
    for (const tExp of exp) {
      const tNear = nearest(ev, tExp);
      const errMs = tNear == null ? Infinity : Math.abs((tNear - tExp) * 1000);

      let score = 0;
      if (errMs <= safeGood) score = 1;
      else if (errMs <= maxAlignMs) {
        const x = Math.min(1, (errMs - safeGood) / width);
        score = 1 - Math.pow(x, 1.5);
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
