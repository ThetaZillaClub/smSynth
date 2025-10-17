// utils/scoring/helpers.ts
import type { PitchSample } from "./types";

export function estimateAvgDt(samples: { tSec: number }[]): number {
  if (samples.length < 2) return 1 / 50;
  const total = samples[samples.length - 1].tSec - samples[0].tSec;
  return total > 0 ? total / (samples.length - 1) : 1 / 50;
}

export function nearest(arr: number[], x: number): number | null {
  if (!arr.length) return null;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1; else hi = mid;
  }
  const a = arr[lo];
  const b = lo > 0 ? arr[lo - 1] : null;
  if (b == null) return a;
  return Math.abs(b - x) < Math.abs(a - x) ? b : a;
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function filterVoiced(
  samples: PitchSample[],
  confMin = 0
): PitchSample[] {
  return confMin > 0
    ? samples.filter((s) => (s.hz ?? 0) > 0 && s.conf >= confMin)
    : samples.filter((s) => (s.hz ?? 0) > 0);
}

/**
 * Linear precision credit between full and zero thresholds.
 * - Full credit at <= fullCents (default 50¢)
 * - Linearly falls to 0 credit at >= zeroCents (default 100¢)
 *   e.g. with defaults: 51¢ -> 0.98 credit, 75¢ -> 0.50 credit, 100¢ -> 0
 *
 * @param absCents Absolute cents error (can be signed; we take |·|)
 * @param fullCents Cents at/under which credit is 1.0
 * @param zeroCents Cents at/over which credit is 0.0
 * @returns Credit in [0,1]
 */
export function linearCredit50_100(
  absCents: number,
  fullCents = 50,
  zeroCents = 100
): number {
  if (!Number.isFinite(absCents)) return 0;
  const a = Math.abs(absCents);
  if (a <= fullCents) return 1;
  if (a >= zeroCents) return 0;
  const credit = 1 - (a - fullCents) / (zeroCents - fullCents);
  return clamp01(credit);
}
