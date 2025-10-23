// utils/scoring/intervals/computeIntervals.ts
import type { Phrase } from "@/utils/stage";
import { hzToMidi, midiToHz, centsBetweenHz } from "@/utils/pitch/pitchMath";
import type { IntervalScore, PitchSample } from "../types";
import { intervalLabel } from "@/components/training/layout/stage/side-panel/SidePanelScores/format";
import { softCreditCosine } from "../helpers";

/**
 * Interval accuracy (binary) with soft measurement:
 * - Per note, estimate a robust pitch *center* using a credit-weighted median
 *   over all frames in the eval window (no hard on/off filtering).
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
  const ONSET_GRACE_MS = 100; // match useTakeScoring default
  const TAIL_GRACE_MS = 80;
  const ZERO_CENTS = 240; // soft cosine tail
  const tolSemis = Math.abs(centsOk) / 100;

  // Pre-sort (they should already be time ordered post-align)
  const voiced = samplesVoiced.slice().sort((a, b) => a.tSec - b.tSec);

  // Robust per-note centers via weighted median over all frames in-window
  const centersMidi: number[] = notes.map((n) => {
    const start = n.startSec + ONSET_GRACE_MS / 1000;
    const rawEnd = n.startSec + n.durSec;
    const end = Math.max(start, rawEnd - TAIL_GRACE_MS / 1000);
    const targetHz = midiToHz(n.midi);
    return centerMidiInRange(voiced, start, end, targetHz, centsOk, ZERO_CENTS);
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
 * Robust per-note center without hard filtering:
 * 1) Filter frames to [t0, t1], voiced only.
 * 2) Score each frame vs the note target (soft cosine).
 * 3) Return the credit-weighted median MIDI across *all* frames.
 *    If all credits are ~0, fall back to the simple median.
 */
function centerMidiInRange(
  samples: PitchSample[],
  t0: number,
  t1: number,
  targetHz: number,
  centsOk: number,
  zeroCents: number
): number {
  if (!(t1 > t0)) return NaN;
  const frames = samples.filter((s) => s.tSec >= t0 && s.tSec <= t1 && (s.hz ?? 0) > 0);
  if (!frames.length) return NaN;

  const scored = frames.map((s) => {
    const errCents = Math.abs(centsBetweenHz(s.hz!, targetHz));
    const credit = softCreditCosine(errCents, centsOk, zeroCents);
    return { midi: hzToMidi(s.hz!), w: Math.max(0, credit) };
  });

  const totalW = scored.reduce((a, z) => a + z.w, 0);

  // Fallback if everything got weight ~0
  if (totalW <= 1e-6) {
    const mids = scored.map((z) => z.midi).sort((a, b) => a - b);
    return mids[Math.floor(mids.length / 2)];
  }

  // Weighted median
  const sorted = scored.slice().sort((a, b) => a.midi - b.midi);
  let acc = 0;
  const half = totalW / 2;
  for (const z of sorted) {
    acc += z.w;
    if (acc >= half) return z.midi;
  }
  return sorted[sorted.length - 1].midi;
}
