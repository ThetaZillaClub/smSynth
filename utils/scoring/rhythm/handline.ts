// utils/scoring/rhythm/handLine.ts
import type { RhythmEval } from "../types";
import { mean } from "../helpers";

/**
 * Robust one-to-one alignment between expected onsets and detected events.
 * - Monotonic (no reordering), unique matches
 * - Skips (gaps) allowed on either side with zero credit
 * - Match chosen only if |Δt| <= maxAlignMs; credit uses a gentle cosine falloff
 * - Tie-breaker biases toward MATCH > skip-event > skip-expected to absorb extras early
 */
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
  unique?: boolean; // if false, keep the old per-onset nearest logic (no 1-1 guarantee)
}): RhythmEval {
  if (!onsets?.length) {
    return { pct: 0, hitRate: 0, meanAbs: 0, evaluated: false, perEvent: [] };
  }

  const exp = onsets.slice().sort((a, b) => a - b);
  const ev = events.slice().sort((a, b) => a - b);

  const safeGood = Math.max(0, goodAlignMs);
  const width = Math.max(1, maxAlignMs - safeGood); // avoid /0

  // Gentle cosine credit inside [goodAlignMs, maxAlignMs]
  const creditOf = (errMs: number): number => {
    if (errMs <= safeGood) return 1;
    if (errMs <= maxAlignMs) {
      const t = Math.min(1, (errMs - safeGood) / width); // 0..1
      return 0.5 * (1 + Math.cos(Math.PI * t)); // 1 → 0 smoothly
    }
    return -Infinity; // treat out-of-range as impossible match in DP
  };

  // -------- Non-unique legacy mode (per-onset nearest) ----------
  if (!unique) {
    const perEvent: RhythmEval["perEvent"] = [];
    let hits = 0;
    const absErrMs: number[] = [];

    for (let i = 0; i < exp.length; i++) {
      const tExp = exp[i];
      // find nearest event (could be the same event for multiple i)
      let bestK = -1, bestErr = Infinity;
      for (let k = 0; k < ev.length; k++) {
        const err = Math.abs(ev[k] - tExp);
        if (err < bestErr) { bestErr = err; bestK = k; }
      }
      const tap = bestK >= 0 ? ev[bestK] : null;
      const errMs = tap == null ? null : Math.abs((tap - tExp) * 1000);

      const c =
        errMs == null
          ? 0
          : errMs <= safeGood
          ? 1
          : errMs <= maxAlignMs
          ? 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (errMs - safeGood) / width)))
          : 0;

      const hit = errMs != null && errMs <= maxAlignMs;
      if (hit && errMs != null) { hits++; absErrMs.push(errMs); }

      perEvent.push({
        idx: i,
        expSec: tExp,
        tapSec: tap,
        errMs,
        credit: c,
        hit,
      });
    }

    const pct = (perEvent.reduce((a, p) => a + p.credit, 0) / (perEvent.length || 1)) * 100;
    const hitRate = perEvent.length ? hits / perEvent.length : 0;
    const meanAbs = absErrMs.length ? mean(absErrMs) : maxAlignMs;
    return { pct, hitRate, meanAbs, evaluated: true, perEvent };
  }

  // ---------------- DP alignment (unique, monotonic) ----------------
  const n = exp.length, m = ev.length;
  // dpScore[i][j] = best total credit for exp[0..i-1], ev[0..j-1]
  const dpScore: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(-Infinity));
  // parent pointer: 0=match diag, 1=skip expected (up), 2=skip event (left), -1=none
  const parent: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(-1));

  // base cases: skipping leading expected/events yields 0 score
  for (let i = 0; i <= n; i++) {
    dpScore[i][0] = 0;
    parent[i][0] = i === 0 ? -1 : 1; // up
  }
  for (let j = 0; j <= m; j++) {
    dpScore[0][j] = 0;
    parent[0][j] = j === 0 ? -1 : 2; // left
  }
  parent[0][0] = -1;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const tExp = exp[i - 1];
      const tEv = ev[j - 1];
      const errMs = Math.abs((tEv - tExp) * 1000);
      const matchCredit = creditOf(errMs); // -Infinity if > maxAlignMs

      const candMatch = matchCredit > -Infinity ? dpScore[i - 1][j - 1] + matchCredit : -Infinity;
      const candSkipExp = dpScore[i - 1][j];  // miss an expected beat
      const candSkipEvt = dpScore[i][j - 1];  // ignore an extra detection

      // pick the best; tie-breaker preference: MATCH > skip-event > skip-expected
      let best = candMatch, act = 0;
      if (candSkipEvt > best || (candSkipEvt === best && act !== 0)) {
        best = candSkipEvt; act = 2;
      }
      if (candSkipExp > best) { best = candSkipExp; act = 1; }

      dpScore[i][j] = best;
      parent[i][j] = act;
    }
  }

  // Backtrack to build mapping from expected index -> event index (or -1)
  const matchIdx = Array<number>(n).fill(-1);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const act = parent[i][j];
    if (act === 0) { // match
      matchIdx[i - 1] = j - 1;
      i--; j--;
    } else if (act === 1) { // skip expected
      i--;
    } else if (act === 2) { // skip event
      j--;
    } else {
      // should only be at (0,0)
      break;
    }
  }

  // Build per-event results and summary stats
  let hits = 0;
  const absErrMs: number[] = [];
  const scores: number[] = [];
  const perEvent: RhythmEval["perEvent"] = [];

  for (let k = 0; k < n; k++) {
    const tExp = exp[k];
    const jMatch = matchIdx[k];
    const tTap = jMatch >= 0 ? ev[jMatch] : null;
    const errMs = tTap == null ? null : Math.abs((tTap - tExp) * 1000);

    let c = 0;
    if (errMs == null) c = 0;
    else if (errMs <= safeGood) c = 1;
    else if (errMs <= maxAlignMs) {
      const t = Math.min(1, (errMs - safeGood) / width);
      c = 0.5 * (1 + Math.cos(Math.PI * t));
    } else c = 0;

    const hit = errMs != null && errMs <= maxAlignMs;
    if (hit && errMs != null) { hits++; absErrMs.push(errMs); }
    scores.push(c);

    perEvent.push({
      idx: k,
      expSec: tExp,
      tapSec: tTap,
      errMs,
      credit: c,
      hit,
    });
  }

  const pct = (scores.reduce((a, b) => a + b, 0) / (scores.length || 1)) * 100;
  const hitRate = n ? hits / n : 0;
  const meanAbs = absErrMs.length ? mean(absErrMs) : maxAlignMs;

  return { pct, hitRate, meanAbs, evaluated: true, perEvent };
}
