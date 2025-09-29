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

  const voiced = filterVoiced(samples, confMin);
  const perNote: PerNotePitch[] = [];
  let sumOn = 0, sumDur = 0, allCentsAbs: number[] = [];

  for (let i = 0; i < phrase.notes.length; i++) {
    const n = phrase.notes[i];
    const start = n.startSec + onsetGraceMs / 1000;
    const end   = n.startSec + n.durSec;
    const sw = voiced.filter((s) => s.tSec >= start && s.tSec <= end);
    const step = estimateAvgDt(sw);
    const targetHz = midiToHz(n.midi);
    let goodSec = 0;
    const centsAbs: number[] = [];

    for (const s of sw) {
      const cents = centsBetweenHz(s.hz!, targetHz);
      centsAbs.push(Math.abs(cents));
      if (Math.abs(cents) <= centsOk) goodSec += step;
    }

    const evalDur = Math.max(0, end - start);
    const ratio = evalDur > 0 ? Math.min(1, goodSec / evalDur) : 0;
    sumOn += goodSec;
    sumDur += evalDur;
    const mae = centsAbs.length ? mean(centsAbs) : 120;

    perNote.push({ idx: i, timeOnPitch: goodSec, dur: evalDur, ratio, centsMae: mae });
    allCentsAbs.push(...centsAbs);
  }

  const timeOnPitchRatio = sumDur > 0 ? Math.min(1, sumOn / sumDur) : 0;
  let percent = 100 * timeOnPitchRatio;
  const centsMaeAll = allCentsAbs.length ? mean(allCentsAbs) : 120;
  if (percent > 98.5 && centsMaeAll < 12) percent = 100;

  return {
    percent: Math.max(0, Math.min(100, percent)),
    timeOnPitchRatio,
    centsMae: centsMaeAll,
    perNote,
  };
}
