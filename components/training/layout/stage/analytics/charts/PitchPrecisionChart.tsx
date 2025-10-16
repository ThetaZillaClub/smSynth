// components/training/layout/stage/analytics/charts/PitchPrecisionChart.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { midiLabelForKey } from "@/utils/pitch/enharmonics";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";
import MultiSeriesLines, { type Series } from "../MultiSeriesLines";

type TakeSnap = { phrase: Phrase; rhythm: RhythmEvent[] | null };

const PITCH_MAX_CENTS = 120;

export default function PitchPrecisionChart({
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
    type Acc = { sumMae: number; count: number };

    const order = new Map<string, number>(); let ordCounter = 0;
    const maeMaps: Array<Map<string, Acc>> = Array.from({ length: nT }, () => new Map());

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
        const bucket = maeMaps[t]!.get(label) ?? { sumMae: 0, count: 0 };
        bucket.sumMae += Math.max(0, stat.centsMae);
        bucket.count += 1;
        maeMaps[t]!.set(label, bucket);
      }
    }

    const labels = Array.from(order.entries()).sort((a, b) => a[1] - b[1]).map(([k]) => k);

    const maeSeries: Series[] = [];
    for (const label of labels) {
      const maeVals = Array.from({ length: nT }, () => null as number | null);
      for (let t = 0; t < nT; t++) {
        const g = maeMaps[t]!.get(label);
        if (!g || g.count === 0) continue;
        maeVals[t] = Math.min(PITCH_MAX_CENTS, g.sumMae / g.count);
      }
      maeSeries.push({ label, values: maeVals });
    }

    const MAX_SERIES = 8;
    return maeSeries.slice(0, MAX_SERIES);
  }, [scores, snapshots, tonicPc, scaleName]);

  return (
    <MultiSeriesLines
      title="Pitch precision • MAE (¢) (per note, per take)"
      series={series}
      height={height}
      yMin={0}
      yMax={PITCH_MAX_CENTS}
      ySuffix="¢"
      invertY
      reserveTopGutter={false}
      legendRowHeight={22}
      introEpoch={introEpoch}
    />
  );
}
