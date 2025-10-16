// components/training/layout/stage/analytics/charts/MelodyCoverageChart.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { secondsToNoteName } from "../../side-panel/SidePanelScores/format";
import MultiSeriesLines, { type Series } from "../MultiSeriesLines";

type TakeSnap = { phrase: Phrase; rhythm: RhythmEvent[] | null };

export default function MelodyCoverageChart({
  scores,
  snapshots,
  bpm,
  den,
  height = "100%",
  introEpoch = 0,
}: {
  scores: TakeScore[];
  snapshots: TakeSnap[];
  bpm: number;
  den: number;
  height?: number | string;
  introEpoch?: number;
}) {
  const series: Series[] = React.useMemo(() => {
    const nT = scores.length;
    const acc = new Map<string, Array<number | null>>();
    const order = new Map<string, number>(); let o = 0;

    for (let i = 0; i < nT; i++) {
      const s = scores[i]!;
      const snap = snapshots[i];
      const per = s.rhythm.perNoteMelody ?? [];
      const notes = snap?.phrase?.notes ?? [];

      const perLabel = new Map<string, { sum: number; count: number }>();
      for (let j = 0; j < notes.length; j++) {
        const r = per[j];
        if (!r || typeof r.coverage !== "number") continue;
        const label = secondsToNoteName(notes[j]!.durSec, bpm, den);
        if (!order.has(label)) order.set(label, o++);
        const g = perLabel.get(label) ?? { sum: 0, count: 0 };
        g.sum += r.coverage * 100;
        g.count += 1;
        perLabel.set(label, g);
      }
      for (const [label, g] of perLabel) {
        if (!acc.has(label)) acc.set(label, Array.from({ length: nT }, () => null));
        acc.get(label)![i] = g.count ? g.sum / g.count : null;
      }
    }

    const all = Array.from(acc.entries()).map(([label, values]) => ({ label, values, ord: order.get(label) ?? 1e9 }))
      .sort((a, b) => a.ord - b.ord);

    const preferred = ["Quarter", "Eighth", "Dotted eighth", "Sixteenth"];
    all.sort((a, b) => {
      const ai = preferred.indexOf(a.label);
      const bi = preferred.indexOf(b.label);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.ord - b.ord;
    });

    const MAX_SERIES = 6;
    return all.slice(0, MAX_SERIES).map(({ label, values }) => ({ label, values }));
  }, [scores, snapshots, bpm, den]);

  return (
    <MultiSeriesLines
      title="Melody coverage • by duration (per take)"
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
