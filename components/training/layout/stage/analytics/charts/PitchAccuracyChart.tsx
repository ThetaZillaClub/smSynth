// components/training/layout/stage/analytics/charts/PitchAccuracyChart.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { midiLabelForKey } from "@/utils/pitch/enharmonics";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";
import MultiSeriesLines, { type Series } from "../MultiSeriesLines";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type TakeSnap = { phrase: Phrase; rhythm: RhythmEvent[] | null };

export default function PitchAccuracyChart({
  scores,
  snapshots,
  tonicPc,
  scaleName,
  height = "100%",
  introEpoch = 0,
}: {
  scores: TakeScore[];
  snapshots: TakeSnap[];
  tonicPc: number;
  scaleName: string | SolfegeScaleName;
  height?: number | string;
  introEpoch?: number;
}) {
  const series: Series[] = React.useMemo(() => {
    const nT = scores.length;
    type Acc = { sumRatio: number; count: number };

    const order = new Map<string, number>(); let ordCounter = 0;
    const accMaps: Array<Map<string, Acc>> = Array.from({ length: nT }, () => new Map());

    for (let t = 0; t < nT; t++) {
      const s = scores[t]!;
      const snap = snapshots[t];
      const per = s.pitch.perNote ?? [];
      const notes = snap?.phrase?.notes ?? [];

      for (let j = 0; j < notes.length; j++) {
        const stat = per[j]; if (!stat) continue;
        const midi = Math.round(notes[j]!.midi);
        const label = midiLabelForKey(midi, tonicPc, scaleName as SolfegeScaleName).text;

        if (!order.has(label)) order.set(label, ordCounter++);
        const bucket = accMaps[t]!.get(label) ?? { sumRatio: 0, count: 0 };
        bucket.sumRatio += clamp01(stat.ratio);
        bucket.count += 1;
        accMaps[t]!.set(label, bucket);
      }
    }

    const labels = Array.from(order.entries()).sort((a, b) => a[1] - b[1]).map(([k]) => k);

    const accSeries: Series[] = [];
    for (const label of labels) {
      const accVals = Array.from({ length: nT }, () => null as number | null);
      for (let t = 0; t < nT; t++) {
        const g = accMaps[t]!.get(label);
        if (!g || g.count === 0) continue;
        accVals[t] = (g.sumRatio / g.count) * 100;
      }
      accSeries.push({ label, values: accVals });
    }

    const MAX_SERIES = 8;
    return accSeries.slice(0, MAX_SERIES);
  }, [scores, snapshots, tonicPc, scaleName]);

  return (
    <MultiSeriesLines
      title="Pitch accuracy • on-pitch% (per note, per take)"
      series={series}
      height={height}
      yMin={0}
      yMax={100}
      ySuffix="%"
      reserveTopGutter={false}
      legendRowHeight={22}
      introEpoch={introEpoch}
    />
  );
}
