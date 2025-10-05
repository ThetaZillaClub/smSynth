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
  if (!onsets?.length) {
    return { pct: 0, hitRate: 0, meanAbs: 0, evaluated: false, perEvent: [] };
  }

  const exp = onsets.slice().sort((a, b) => a - b);
  const ev = events.slice().sort((a, b) => a - b);

  let hits = 0;
  const absErrMs: number[] = [];
  const scores: number[] = [];
  const perEvent: RhythmEval["perEvent"] = [];

  const safeGood = Math.max(0, goodAlignMs);
  const width = Math.max(1, maxAlignMs - safeGood); // avoid /0

  const nearestIndex = (arr: number[], x: number): number => {
    if (!arr.length) return -1;
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid + 1; else hi = mid;
    }
    let best = lo;
    if (lo > 0 && Math.abs(arr[lo - 1] - x) <= Math.abs(arr[lo] - x)) best = lo - 1;
    return best;
  };

  if (unique) {
    let j = 0;
    for (let i = 0; i < exp.length; i++) {
      const tExp = exp[i];
      if (j >= ev.length) {
        scores.push(0);
        perEvent.push({ idx: i, expSec: tExp, tapSec: null, errMs: null, credit: 0, hit: false });
        continue;
      }

      while (
        j + 1 < ev.length &&
        Math.abs(ev[j + 1] - tExp) <= Math.abs(ev[j] - tExp)
      ) {
        j++;
      }

      const tNear = ev[j];
      const errMs = Math.abs((tNear - tExp) * 1000);

      let credit = 0;
      if (errMs <= safeGood) credit = 1;
      else if (errMs <= maxAlignMs) {
        const x = Math.min(1, (errMs - safeGood) / width);
        credit = 1 - Math.pow(x, 1.5);
      }

      const hit = errMs <= maxAlignMs;
      if (hit) { hits++; absErrMs.push(errMs); }
      scores.push(credit);

      perEvent.push({
        idx: i,
        expSec: tExp,
        tapSec: tNear,
        errMs,
        credit,
        hit,
      });

      j++;
    }
  } else {
    for (let i = 0; i < exp.length; i++) {
      const tExp = exp[i];
      const k = nearestIndex(ev, tExp);
      const tNear = k >= 0 ? ev[k] : null;
      const errMs = tNear == null ? null : Math.abs((tNear - tExp) * 1000);

      let credit = 0;
      if (errMs == null) {
        credit = 0;
      } else if (errMs <= safeGood) credit = 1;
      else if (errMs <= maxAlignMs) {
        const x = Math.min(1, (errMs - safeGood) / width);
        credit = 1 - Math.pow(x, 1.5);
      }

      const hit = errMs != null && errMs <= maxAlignMs;
      if (hit && errMs != null) { hits++; absErrMs.push(errMs); }
      scores.push(credit);

      perEvent.push({
        idx: i,
        expSec: tExp,
        tapSec: tNear,
        errMs,
        credit,
        hit,
      });
    }
  }

  const pct = (scores.reduce((a, b) => a + b, 0) / (scores.length || 1)) * 100;
  const hitRate = exp.length ? hits / exp.length : 0;
  const meanAbs = absErrMs.length ? mean(absErrMs) : maxAlignMs;
  return { pct, hitRate, meanAbs, evaluated: true, perEvent };
}
