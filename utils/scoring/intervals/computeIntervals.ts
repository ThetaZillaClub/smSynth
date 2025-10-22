// utils/scoring/intervals/computeIntervals.ts
import type { Phrase } from "@/utils/stage";
import { hzToMidi, midiToHz, centsBetweenHz } from "@/utils/pitch/pitchMath";
import type { IntervalScore, PitchSample } from "../types";
import { intervalLabel } from "@/components/training/layout/stage/side-panel/SidePanelScores/format";
import { softCreditCosine } from "../helpers";

/**
 * Interval accuracy (binary) with soft measurement:
 * - Per note, estimate a robust pitch *center* by taking frames that are "on pitch"
 *   (credit >= ON_THRESH using the same soft cosine as pitch scoring). If there
 *   aren't enough on-pitch frames, use a top-credit fallback slice.
 * - Interval = difference of those per-note centers (in semitones).
 * - Direction-agnostic interval class (0..12).
 * - Binary credit:
 *     1) exact class match via rounding, OR
 *     2) absolute semitone gap |got|-|exp| within centsOk tolerance (in semitones)
 */
export function computeIntervalScore(
  phrase: Phrase,
  samplesVoiced: PitchSample[],
  centsOk: number = 60
): IntervalScore {
  const notes = phrase?.notes ?? [];
  if (notes.length < 2) {
    return { total: 0, correct: 0, correctRatio: 0, classes: makeEmptyClasses() };
  }

  // Match pitch scoring trims/feel
  const ONSET_GRACE_MS = 100;   // match useTakeScoring default
  const TAIL_GRACE_MS  = 80;
  const ON_THRESH      = 0.85;  // "on" same as pitch landing threshold
  const ZERO_CENTS     = 240;   // soft cosine tail
  const tolSemis       = Math.abs(centsOk) / 100;

  // Pre-sort (they should already be time ordered post-align)
  const voiced = samplesVoiced.slice().sort((a, b) => a.tSec - b.tSec);

  // Robust per-note centers
  const centersMidi: number[] = notes.map((n) => {
    const start = n.startSec + ONSET_GRACE_MS / 1000;
    const rawEnd = n.startSec + n.durSec;
    const end = Math.max(start, rawEnd - TAIL_GRACE_MS / 1000);
    const targetHz = midiToHz(n.midi);
    return centerMidiInRange(voiced, start, end, targetHz, centsOk, ON_THRESH, ZERO_CENTS);
  });

  // Per-class aggregation (0..12)
  const by: Map<number, { attempts: number; correct: number }> = new Map();
  for (let k = 0; k <= 12; k++) by.set(k, { attempts: 0, correct: 0 });

  let total = 0;
  let correctInt = 0;

  for (let i = 1; i < notes.length; i++) {
    const mPrev = centersMidi[i - 1];
    const mCurr = centersMidi[i];
    if (!Number.isFinite(mPrev) || !Number.isFinite(mCurr)) continue;

    // Expected vs observed (semitones)
    const expFloat = notes[i].midi - notes[i - 1].midi;
    const gotFloat = mCurr - mPrev;

    const expAbsFloat = Math.abs(expFloat);
    const gotAbsFloat = Math.abs(gotFloat);

    const expAbsInt = Math.abs(Math.round(expFloat));
    const gotAbsInt = Math.abs(Math.round(gotFloat));

    // Binary credit:
    // exact class match after rounding OR within tolerance in semitones
    const credit =
      gotAbsInt === expAbsInt || Math.abs(gotAbsFloat - expAbsFloat) <= tolSemis ? 1 : 0;

    const cls = Math.min(12, expAbsInt);
    const cell = by.get(cls)!;
    cell.attempts += 1;
    cell.correct += credit;

    total += 1;
    correctInt += credit;
  }

  const classes = Array.from(by.entries()).map(([semi, v]) => ({
    semitones: semi,
    label: intervalLabel(semi),
    attempts: v.attempts,
    correct: v.correct,
    percent: v.attempts ? (100 * v.correct) / v.attempts : 0,
  }));

  return {
    total,
    correct: correctInt,
    correctRatio: total ? correctInt / total : 0,
    classes,
  };
}

function makeEmptyClasses() {
  return Array.from({ length: 13 }, (_, i) => ({
    semitones: i,
    label: intervalLabel(i),
    attempts: 0,
    correct: 0,
    percent: 0,
  }));
}

/**
 * Robust per-note center:
 * 1) Filter frames to [t0, t1]
 * 2) Score each frame vs the note target (soft cosine)
 * 3) Prefer frames with credit >= onThresh.
 *    If too few, take the top-credit slice (max(3, 40%) of frames).
 * 4) Return the median MIDI of the selected frames.
 */
function centerMidiInRange(
  samples: PitchSample[],
  t0: number,
  t1: number,
  targetHz: number,
  centsOk: number,
  onThresh: number,
  zeroCents: number
): number {
  if (!(t1 > t0)) return NaN;
  const frames = samples.filter((s) => s.tSec >= t0 && s.tSec <= t1 && (s.hz ?? 0) > 0);
  if (!frames.length) return NaN;

  const scored = frames.map((s) => {
    const errCents = Math.abs(centsBetweenHz(s.hz!, targetHz));
    const credit = softCreditCosine(errCents, centsOk, zeroCents);
    return { midi: hzToMidi(s.hz!), credit };
  });

  const on = scored.filter((z) => z.credit >= onThresh);
  let xs: number[];
  if (on.length >= 3) {
    xs = on.map((z) => z.midi);
  } else {
    // Fallback: take the top-credit slice (avoid scoops/releases)
    const k = Math.max(3, Math.ceil(scored.length * 0.4));
    xs = scored
      .slice()
      .sort((a, b) => b.credit - a.credit)
      .slice(0, k)
      .map((z) => z.midi);
  }

  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)];
}
