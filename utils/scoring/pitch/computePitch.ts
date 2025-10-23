// utils/scoring/pitch/computePitch.ts
import type { Phrase } from "@/utils/stage";
import { midiToHz, centsBetweenHz } from "@/utils/pitch/pitchMath";
import { estimateAvgDt, mean, softCreditCosine } from "../helpers";
import type { Options, PitchSample, PitchScore, PerNotePitch } from "../types";

/**
 * Pitch scoring with:
 *  1) Frame-wise integration over the *entire* eval window (unvoiced = 0 credit)
 *  2) A "landing" bonus: longest contiguous on-pitch streak rewards correctness
 *  3) Concave shaping so partial coverage doesn't score linearly (healthier midrange)
 *
 * - Keeps timeOnPitchRatio (raw) for analytics
 * - Uses shaped+landing ratio for the user-facing pitch.percent
 */
export function computePitchScore(
  phrase: Phrase,
  samples: PitchSample[],
  options: Required<Pick<Options, "confMin" | "centsOk" | "onsetGraceMs">>
): PitchScore {
  const { confMin, centsOk, onsetGraceMs } = options;

  const TAIL_GRACE_MS = 80;    // ignore a touch of release wobble
  const TRIM_UPPER   = 0.25;   // robust MAE (trim top quartile)
  const ZERO_CENTS   = 240;    // cosine falloff hits 0 by 240¢ (musical tail)

  // Landing model (declare pitch once you *hold* it briefly)
  const ON_CREDIT_THRESH = 0.85; // frames counted "on" if credit >= 0.85
  const LANDING_SEC      = 0.30; // ~300ms hold gets full landing credit
  const LANDING_MAX      = 0.85; // landing tops out at 85% credit for the note

  // Concave shaping on coverage-quality ratio (r in [0,1])
  // r' = 1 - (1 - r)^K  with K=2  (e.g., r=0.43 → 0.675)
  const SHAPE_K = 2;

  // Cadence from the full stream so gaps lower score naturally.
  const GLOBAL_DT = Math.max(0.001, estimateAvgDt(samples)); // ~0.016–0.02s typical

  const perNote: PerNotePitch[] = [];
  let sumGoodBase = 0;     // unshaped good seconds
  let sumGoodFinal = 0;    // shaped+landing good seconds
  let sumDur = 0;          // evaluated seconds
  const allCentsAbs: number[] = [];

  for (let i = 0; i < (phrase.notes?.length || 0); i++) {
    const n = phrase.notes[i];

    // Head grace + tiny tail cut
    const start = n.startSec + onsetGraceMs / 1000;
    const rawEnd = n.startSec + n.durSec;
    const end = Math.max(start, rawEnd - TAIL_GRACE_MS / 1000);
    const evalDur = Math.max(0, end - start);

    if (evalDur <= 0) {
      perNote.push({
        idx: i,
        midi: Math.round(n.midi),
        timeOnPitch: 0,
        dur: 0,
        ratio: 0,
        centsMae: 120,
      });
      continue;
    }

    // All frames (voiced or not) within the window
    const frames = samples.filter((s) => s.tSec >= start && s.tSec <= end);

    // ❗ Use the window duration as the denominator so sparse frames
    //    (or temporary deserts) don't zero out evaluation.
    const denomSec = evalDur;

    if (denomSec <= 0) {
      perNote.push({
        idx: i,
        midi: Math.round(n.midi),
        timeOnPitch: 0,
        dur: 0,
        ratio: 0,
        centsMae: 120,
      });
      continue;
    }

    const targetHz = midiToHz(n.midi);
    let goodSecBase = 0;

    // For landing: track longest contiguous "on" streak
    let bestStreak = 0;
    let curStreak = 0;

    const centsAbsVoiced: number[] = [];

    for (const s of frames) {
      const voiced = (s.hz ?? 0) > 0 && (s.conf ?? 0) >= confMin;
      let credit = 0;
      if (voiced) {
        const errCents = Math.abs(centsBetweenHz(s.hz!, targetHz));
        centsAbsVoiced.push(errCents);
        credit = softCreditCosine(errCents, centsOk, ZERO_CENTS);
      }
      // integrate base credit (unshaped)
      goodSecBase += GLOBAL_DT * credit;

      // update landing streak
      if (credit >= ON_CREDIT_THRESH) {
        curStreak += GLOBAL_DT;
      } else {
        if (curStreak > bestStreak) bestStreak = curStreak;
        curStreak = 0;
      }
    }
    if (curStreak > bestStreak) bestStreak = curStreak; // tail check

    // Base ratio (raw, used for analytics)
    const baseRatio = clamp01(denomSec > 0 ? goodSecBase / denomSec : 0);

    // Concave shaping: raise middles without hitting 100 too fast
    const shapedRatio = 1 - Math.pow(1 - baseRatio, SHAPE_K); // [0,1]

    // Landing credit: saturates to LANDING_MAX at LANDING_SEC
    const landingCredit = Math.min(1, bestStreak / LANDING_SEC) * LANDING_MAX;

    // Final per-note ratio = max of shaped coverage and landing
    const finalRatio = Math.max(shapedRatio, landingCredit);

    // Accumulate totals
    sumGoodBase  += baseRatio  * denomSec;
    sumGoodFinal += finalRatio * denomSec;
    sumDur       += denomSec;

    // Robust MAE over voiced frames only (truthful stability metric)
    const mae = centsAbsVoiced.length ? trimmedMean(centsAbsVoiced, TRIM_UPPER) : 120;
    allCentsAbs.push(...centsAbsVoiced);

    // Per-note record (use finalRatio so UI shows shaped score)
    perNote.push({
      idx: i,
      midi: Math.round(n.midi),
      timeOnPitch: finalRatio * denomSec, // shaped+landing seconds, within the captured window
      dur: denomSec,
      ratio: finalRatio,
      centsMae: mae,
    });
  }

  // Report BOTH: raw time-on-pitch (for analytics chip) and shaped percent (for score)
  const timeOnPitchRatio = sumDur > 0 ? clamp01(sumGoodBase / sumDur) : 0; // raw
  const finalRatio = sumDur > 0 ? clamp01(sumGoodFinal / sumDur) : 0;      // shaped+landing
  const centsMaeAll = allCentsAbs.length ? trimmedMean(allCentsAbs, 0.25) : 120;

  return {
    percent: Math.round(finalRatio * 100 * 10) / 10, // 1-decimal like the rest of UI
    timeOnPitchRatio,
    centsMae: centsMaeAll,
    perNote,
  };
}

function trimmedMean(xs: number[], upperTrim = 0.25, lowerTrim = 0): number {
  if (!xs.length) return 0;
  const ys = xs.slice().sort((a, b) => a - b);
  const lo = Math.floor(ys.length * lowerTrim);
  const hi = Math.max(lo + 1, Math.ceil(ys.length * (1 - upperTrim)));
  return mean(ys.slice(lo, hi));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
