// components/training/layout/stage/analytics/charts/IntervalsChart.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import { intervalLabel } from "../../side-panel/SidePanelScores/format";
import MultiSeriesLines, { type Series } from "../../../../../ui/MultiSeriesLines";

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
    const nT = scores.length;

    // Collect ALL interval classes (0..12) that had >0 attempts across any take
    const attemptsBySemi = new Map<number, number>(); // semitones -> total attempts
    for (let i = 0; i < nT; i++) {
      const classes = scores[i]?.intervals?.classes ?? [];
      for (const c of classes) {
        const a = c?.attempts ?? 0;
        if (a > 0) {
          attemptsBySemi.set(c.semitones, (attemptsBySemi.get(c.semitones) ?? 0) + a);
        }
      }
    }

    const wanted = Array.from(attemptsBySemi.keys()).sort((a, b) => a - b);
    if (wanted.length === 0) return [];

    // Build line series for each attempted class
    const lines = wanted.map((semi) => ({
      semitones: semi,
      label: intervalLabel(semi),
      values: Array.from({ length: nT }, () => null as number | null),
    }));

    // Fill values per take as % correct (fractional credit OK)
    for (let i = 0; i < nT; i++) {
      const classes = scores[i]?.intervals?.classes ?? [];
      for (const line of lines) {
        const row = classes.find((c) => c.semitones === line.semitones);
        if (!row) continue;
        const attempts = row.attempts ?? 0;
        const correct = row.correct ?? 0;
        line.values[i] = attempts > 0 ? (100 * correct) / attempts : null;
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
