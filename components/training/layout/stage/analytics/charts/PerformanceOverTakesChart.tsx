// components/training/layout/stage/analytics/charts/PerformanceOverTakesChart.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import MultiSeriesLines, { type Series } from "../MultiSeriesLines";

type BreakdownRow = { color: string; label: string; value: string };

const SEG_COLOR = {
  pitch:     "#86efac",
  melody:    "#bbf7d0",
  line:      "#4ade80", // rhythm line
  intervals: "#22c55e",
} as const;

// Narrow type guard so we don't need `any`
function hasLinePercent(x: unknown): x is { linePercent: number } {
  return typeof x === "object" && x !== null && "linePercent" in x &&
    typeof (x as { linePercent: unknown }).linePercent === "number";
}

export default function PerformanceOverTakesChart({
  scores,
  height = "100%",
  introEpoch = 0,
  introDurationMs = 800,
}: {
  scores: TakeScore[];
  height?: number | string;
  introEpoch?: number;
  introDurationMs?: number;
}) {
  const series: Series[] = React.useMemo(() => {
    return [
      {
        label: "Final",
        values: scores.map((s) => Math.max(0, Math.min(100, s.final.percent))),
      },
    ];
  }, [scores]);

  const tipExtra = React.useCallback(
    (takeIdx: number) => {
      const s = scores[takeIdx];
      if (!s) return null;

      const maybeRows: Array<BreakdownRow | null> = [
        typeof s.pitch?.percent === "number"
          ? { color: SEG_COLOR.pitch, label: "Pitch", value: `${Math.round(s.pitch.percent)}%` }
          : null,
        typeof s.rhythm?.melodyPercent === "number"
          ? { color: SEG_COLOR.melody, label: "Melody", value: `${Math.round(s.rhythm.melodyPercent)}%` }
          : null,
        hasLinePercent(s.rhythm)
          ? { color: SEG_COLOR.line, label: "Rhythm", value: `${Math.round(s.rhythm.linePercent)}%` }
          : null,
        typeof s.intervals?.correctRatio === "number"
          ? { color: SEG_COLOR.intervals, label: "Intervals", value: `${Math.round((s.intervals.correctRatio || 0) * 100)}%` }
          : null,
      ];

      const rows: BreakdownRow[] = maybeRows.filter(
        (x): x is BreakdownRow => x !== null
      );

      if (rows.length === 0) return null;

      return (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.color }} />
              {r.label}: {r.value}
            </div>
          ))}
        </div>
      );
    },
    [scores]
  );

  return (
    <MultiSeriesLines
      title="Performance • final score (per take)"
      series={series}
      height={height}
      yMin={0}
      yMax={100}
      ySuffix="%"
      reserveTopGutter={false}
      legendRowHeight={22}
      introEpoch={introEpoch}
      introDurationMs={introDurationMs}
      tipExtra={tipExtra}
    />
  );
}
