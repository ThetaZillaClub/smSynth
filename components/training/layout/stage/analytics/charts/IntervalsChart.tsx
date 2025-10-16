// components/training/layout/stage/analytics/charts/IntervalsChart.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import { intervalLabel } from "../../side-panel/SidePanelScores/format";
import MultiSeriesLines, { type Series } from "../MultiSeriesLines";

export default function IntervalsChart({
  scores,
  height = "100%",
  introEpoch = 0,
}: {
  scores: TakeScore[];
  height?: number | string;
  introEpoch?: number;
}) {
  const series: Series[] = React.useMemo(() => {
    const wantedBase = [0, 12, 1, 4]; // Unison, Octave, m2, M3
    const nT = scores.length;

    const attempted = new Set<number>();
    for (let i = 0; i < nT; i++) {
      const classes = scores[i]?.intervals?.classes ?? [];
      for (const c of classes) {
        if (wantedBase.includes(c.semitones) && (c.attempts ?? 0) > 0) attempted.add(c.semitones);
      }
    }
    const wanted = wantedBase.filter((semi) => attempted.has(semi));
    if (wanted.length === 0) return [];

    const lines = wanted.map((semi) => ({
      semitones: semi,
      label: intervalLabel(semi),
      values: Array.from({ length: nT }, () => null as number | null),
    }));

    for (let i = 0; i < nT; i++) {
      const classes = scores[i]?.intervals?.classes ?? [];
      for (const line of lines) {
        const row = classes.find((c) => c.semitones === line.semitones);
        if (!row) continue;
        const pct = (row.attempts ?? 0) > 0 ? (100 * (row.correct ?? 0)) / (row.attempts ?? 1) : null;
        line.values[i] = pct;
      }
    }

    return lines
      .filter(({ values }) => values.some((v) => v != null))
      .map(({ label, values }) => ({ label, values })) as Series[];
  }, [scores]);

  return (
    <MultiSeriesLines
      title="Intervals • by class (per take)"
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
