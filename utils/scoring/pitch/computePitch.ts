// utils/scoring/pitch/computePitch.ts
import type { Phrase } from "@/utils/stage";
import { midiToHz, centsBetweenHz } from "@/utils/pitch/pitchMath";
import { estimateAvgDt, mean, filterVoiced, linearCredit50_100 } from "../helpers";
import type { Options, PitchSample, PitchScore, PerNotePitch } from "../types";

export function computePitchScore(
  phrase: Phrase,
  samples: PitchSample[],
  options: Required<Pick<Options, "confMin" | "centsOk" | "onsetGraceMs">>
): PitchScore {
  const { confMin, centsOk, onsetGraceMs } = options;

  const TAIL_GRACE_MS = 80;
  const TRIM_UPPER = 0.25;

  const voiced = filterVoiced(samples, confMin);
  const perNote: PerNotePitch[] = [];
  let sumOn = 0, sumDur = 0, allCentsAbs: number[] = [];

  for (let i = 0; i < phrase.notes.length; i++) {
    const n = phrase.notes[i];
    const start = n.startSec + onsetGraceMs / 1000;
    const endRaw = n.startSec + n.durSec;
    const end = Math.max(start, endRaw - TAIL_GRACE_MS / 1000);

    const sw = voiced.filter((s) => s.tSec >= start && s.tSec <= end);
    const step = estimateAvgDt(sw);
    const targetHz = midiToHz(n.midi);
    let goodSec = 0;
    const centsAbs: number[] = [];

    for (const s of sw) {
      const a = Math.abs(centsBetweenHz(s.hz!, targetHz));
      centsAbs.push(a);
      const credit = linearCredit50_100(a, centsOk, 200);
      goodSec += step * credit;
    }

    const evalDur = Math.max(0, end - start);
    const ratio = evalDur > 0 ? Math.min(1, goodSec / evalDur) : 0;
    sumOn += goodSec;
    sumDur += evalDur;

    const mae = centsAbs.length ? trimmedMean(centsAbs, TRIM_UPPER) : 120;

    // ⬇️ include integer MIDI for DB grouping/insert
    perNote.push({
      idx: i,
      midi: Math.round(n.midi),
      timeOnPitch: goodSec,
      dur: evalDur,
      ratio,
      centsMae: mae,
    });

    allCentsAbs.push(...centsAbs);
  }

  const timeOnPitchRatio = sumDur > 0 ? Math.min(1, sumOn / sumDur) : 0;
  const centsMaeAll = allCentsAbs.length ? trimmedMean(allCentsAbs, TRIM_UPPER) : 120;
  const percent = 100 * timeOnPitchRatio;

  return {
    percent: Math.max(0, Math.min(100, percent)),
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
