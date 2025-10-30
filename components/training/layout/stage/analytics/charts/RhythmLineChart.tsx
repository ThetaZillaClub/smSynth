// components/training/layout/stage/analytics/charts/RhythmLineChart.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import MultiSeriesLines, { type Series } from "../../../../../ui/MultiSeriesLines";

export default function RhythmLineChart({
  scores,
  bpm,
  den,
  height = "100%",
  introEpoch = 0,
}: {
  scores: TakeScore[];
  bpm: number;
  den: number;
  height?: number | string;
  introEpoch?: number;
}) {
  // Beat-only labeler (matches useScoringLifecycle)
  const beatLabel = React.useMemo(() => {
    const beatSec = 60 / Math.max(1, bpm);
    const name = den === 4 ? "Quarter" : "Beat";
    return (sec: number) => {
      if (!Number.isFinite(sec) || sec <= 0) return undefined;
      const ratio = sec / beatSec;
      return Math.abs(ratio - 1) <= 0.25 ? name : undefined; // ±25% tolerance
    };
  }, [bpm, den]);

  const series: Series[] = React.useMemo(() => {
    const nT = scores.length;
    const acc = new Map<string, Array<number | null>>(); // label -> values per take
    const order = new Map<string, number>(); let o = 0;

    for (let i = 0; i < nT; i++) {
      const s = scores[i]!;
      if (!s.rhythm.lineEvaluated) continue;
      const events = s.rhythm.linePerEvent ?? [];
      if (events.length < 2) continue;

      // group by IOI between expected beats — BUT only keep the beat itself
      const perLabel = new Map<string, { sum: number; count: number }>();
      for (let j = 0; j < events.length - 1; j++) {
        const a = events[j]!;
        const b = events[j + 1]!;
        const durSec = Math.max(0, (b.expSec ?? 0) - (a.expSec ?? 0));
        const label = beatLabel(durSec); // only "Quarter"/"Beat" or undefined
        if (!label) continue;

        if (!order.has(label)) order.set(label, o++);
        const creditPct = Math.max(0, Math.min(1, (a.credit ?? 0))) * 100;
        const cell = perLabel.get(label) ?? { sum: 0, count: 0 };
        cell.sum += creditPct;
        cell.count += 1;
        perLabel.set(label, cell);
      }

      for (const [label, g] of perLabel) {
        if (!acc.has(label)) acc.set(label, Array.from({ length: nT }, () => null));
        acc.get(label)![i] = g.count ? g.sum / g.count : null;
      }
    }

    const all = Array.from(acc.entries())
      .map(([label, values]) => ({ label, values, ord: order.get(label) ?? 1e9 }))
      .sort((a, b) => a.ord - b.ord);

    const MAX_SERIES = 3; // in practice this will be 1 (“Quarter”/“Beat”)
    return all.slice(0, MAX_SERIES).map(({ label, values }) => ({ label, values }));
  }, [scores, beatLabel]);

  return (
    <MultiSeriesLines
      title="Rhythm line timing • by beat (per take)"
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
