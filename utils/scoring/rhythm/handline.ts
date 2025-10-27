// utils/scoring/rhythm/handline.ts
import type { RhythmEval } from "../types";
import { mean } from "../helpers";

/**
 * Hand-line rhythm scoring
 * Assumes input `events` are already latency-compensated by the realtime detector.
 * No additional timing offsets are applied here — we only compare exp vs. event directly.
 *
 * - Monotonic, unique 1–1 alignment via DP
 * - No reordering; skips allowed on either side with zero credit
 * - Credit = 1 inside goodAlignMs (if > 0), cosine falloff to 0 by maxAlignMs
 * - Tie-breaker preference: MATCH > skip-event > skip-expected
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
  unique?: boolean;
}): RhythmEval {
  if (!onsets?.length) {
    return { pct: 0, hitRate: 0, meanAbs: 0, evaluated: false, perEvent: [] };
  }

  const exp = onsets.slice().sort((a, b) => a - b);
  const ev = events.slice().sort((a, b) => a - b);

  const safeGood = Math.max(0, goodAlignMs);
  const width = Math.max(1, maxAlignMs - safeGood); // avoid /0

  // Gentle cosine credit inside [goodAlignMs, maxAlignMs]; no latency bias here.
  const creditOf = (errMs: number): number => {
    if (errMs <= safeGood) return 1;
    if (errMs <= maxAlignMs) {
      const t = Math.min(1, (errMs - safeGood) / width); // 0..1
      return 0.5 * (1 + Math.cos(Math.PI * t)); // 1 → 0 smoothly
    }
    return -Infinity; // treat out-of-range as impossible match in DP
  };

  if (!unique) {
    const perEvent: RhythmEval["perEvent"] = [];
    let hits = 0;
    const absErrMs: number[] = [];

    for (let i = 0; i < exp.length; i++) {
      const tExp = exp[i];
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

      perEvent.push({ idx: i, expSec: tExp, tapSec: tap, errMs, credit: c, hit });
    }

    const pct = (perEvent.reduce((a, p) => a + p.credit, 0) / (perEvent.length || 1)) * 100;
    const hitRate = perEvent.length ? hits / perEvent.length : 0;
    const meanAbs = absErrMs.length ? mean(absErrMs) : maxAlignMs;
    return { pct, hitRate, meanAbs, evaluated: true, perEvent };
  }

  // ---------- DP alignment (unique, monotonic) ----------
  const n = exp.length, m = ev.length;
  const dpScore: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(-Infinity));
  const parent: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(-1));

  for (let i = 0; i <= n; i++) { dpScore[i][0] = 0; parent[i][0] = i === 0 ? -1 : 1; }
  for (let j = 0; j <= m; j++) { dpScore[0][j] = 0; parent[0][j] = j === 0 ? -1 : 2; }
  parent[0][0] = -1;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const tExp = exp[i - 1];
      const tEv = ev[j - 1];
      const errMs = Math.abs((tEv - tExp) * 1000);
      const matchCredit = creditOf(errMs);

      const candMatch   = matchCredit > -Infinity ? dpScore[i - 1][j - 1] + matchCredit : -Infinity;
      const candSkipExp = dpScore[i - 1][j];
      const candSkipEvt = dpScore[i][j - 1];

      // prefer MATCH > skip-event > skip-expected
      let best = candMatch, act = 0;
      if (candSkipEvt > best || (candSkipEvt === best && act !== 0)) { best = candSkipEvt; act = 2; }
      if (candSkipExp > best) { best = candSkipExp; act = 1; }

      dpScore[i][j] = best;
      parent[i][j] = act;
    }
  }

  const matchIdx = Array<number>(n).fill(-1);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const act = parent[i][j];
    if (act === 0) { matchIdx[i - 1] = j - 1; i--; j--; }
    else if (act === 1) { i--; }
    else if (act === 2) { j--; }
    else break;
  }

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

    perEvent.push({ idx: k, expSec: tExp, tapSec: tTap, errMs, credit: c, hit });
  }

  const pct = (scores.reduce((a, b) => a + b, 0) / (scores.length || 1)) * 100;
  const hitRate = n ? hits / n : 0;
  const meanAbs = absErrMs.length ? mean(absErrMs) : maxAlignMs;

  return { pct, hitRate, meanAbs, evaluated: true, perEvent };
}
