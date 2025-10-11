// utils/scoring/pitch/computePitch.ts
import type { Phrase } from "@/utils/stage";
import { midiToHz, centsBetweenHz } from "@/utils/pitch/pitchMath";
import { estimateAvgDt, mean, filterVoiced } from "../helpers";
import type { Options, PitchSample, PitchScore, PerNotePitch } from "../types";

export function computePitchScore(
  phrase: Phrase,
  samples: PitchSample[],
  options: Required<Pick<Options, "confMin" | "centsOk" | "onsetGraceMs">>
): PitchScore {
  const { confMin, centsOk, onsetGraceMs } = options;

  // Softer, musical defaults
  const TAIL_GRACE_MS = 80;                               // ignore last 80ms (release)
  const ZERO_CREDIT_CENTS = Math.max(100, centsOk + 45);  // 0 credit by here
  const TRIM_UPPER = 0.10;                                // drop worst 10% for MAE calc

  const voiced = filterVoiced(samples, confMin);
  const perNote: PerNotePitch[] = [];
  let sumOn = 0, sumDur = 0, allCentsAbs: number[] = [];
  let sumEvalDur = 0; // for average evaluated note duration

  for (let i = 0; i < phrase.notes.length; i++) {
    const n = phrase.notes[i];
    const start = n.startSec + onsetGraceMs / 1000;
    const endRaw = n.startSec + n.durSec;
    const end = Math.max(start, endRaw - TAIL_GRACE_MS / 1000); // tail grace

    const sw = voiced.filter((s) => s.tSec >= start && s.tSec <= end);
    const step = estimateAvgDt(sw);
    const targetHz = midiToHz(n.midi);
    let goodSec = 0;
    const centsAbs: number[] = [];

    for (const s of sw) {
      const cents = centsBetweenHz(s.hz!, targetHz);
      const a = Math.abs(cents);
      centsAbs.push(a);

      // Soft credit: full inside centsOk; linear fade to 0 by ZERO_CREDIT_CENTS
      let credit = 0;
      if (a <= centsOk) credit = 1;
      else if (a < ZERO_CREDIT_CENTS) credit = (ZERO_CREDIT_CENTS - a) / (ZERO_CREDIT_CENTS - centsOk);
      goodSec += step * Math.max(0, Math.min(1, credit));
    }

    const evalDur = Math.max(0, end - start);
    const ratio = evalDur > 0 ? Math.min(1, goodSec / evalDur) : 0;
    sumOn += goodSec;
    sumDur += evalDur;
    sumEvalDur += evalDur;

    const mae = centsAbs.length ? trimmedMean(centsAbs, TRIM_UPPER) : 120;

    perNote.push({ idx: i, timeOnPitch: goodSec, dur: evalDur, ratio, centsMae: mae });
    allCentsAbs.push(...centsAbs);
  }

  const timeOnPitchRatio = sumDur > 0 ? Math.min(1, sumOn / sumDur) : 0;
  const centsMaeAll = allCentsAbs.length ? trimmedMean(allCentsAbs, TRIM_UPPER) : 120;

  // Top-end easing: slightly boost 0.80..1.00 coverage so good singing doesn't feel harsh
  const easedRatio = boostTopEnd(timeOnPitchRatio);
  let percent = 100 * easedRatio;

  // --- Short-note perfection snap ------------------------------------------
  // Quarter at 60 BPM ≈ 1.0s; after 120ms onset + 80ms tail, eval ≈ 0.8s.
  // If notes are short and MAE is tight, allow 100% without robotic coverage.
  const avgEvalDur = phrase.notes.length ? (sumEvalDur / phrase.notes.length) : 0;
  const maeTight = centsMaeAll <= 30;                // "pretty darn tight"
  const thr =
    avgEvalDur <= 0.90 ? 0.88 :                     // short notes
    avgEvalDur <= 1.50 ? 0.92 : 0.94;               // medium / long

  if (maeTight && timeOnPitchRatio >= thr) {
    percent = 100;
  }

  return {
    percent: Math.max(0, Math.min(100, percent)),
    timeOnPitchRatio,
    centsMae: centsMaeAll,
    perNote,
  };
}

/** Upper-trimmed mean (drop worst `upperTrim` fraction). */
function trimmedMean(xs: number[], upperTrim = 0.1, lowerTrim = 0): number {
  if (!xs.length) return 0;
  const ys = xs.slice().sort((a, b) => a - b);
  const lo = Math.floor(ys.length * lowerTrim);
  const hi = Math.max(lo + 1, Math.ceil(ys.length * (1 - upperTrim)));
  return mean(ys.slice(lo, hi));
}

/** Gently compress top-end so 0.85..0.95 feels fairer. */
function boostTopEnd(ratio: number): number {
  const pivot = 0.80; // keep everything ≤0.80 unchanged
  if (ratio <= pivot) return ratio;
  const u = (ratio - pivot) / (1 - pivot); // 0..1
  // concave curve (γ<1) boosts toward 1 without making mediocre takes jump
  const gamma = 0.6;
  const boosted = pivot + (1 - pivot) * Math.pow(u, gamma);
  return Math.min(1, boosted);
}
