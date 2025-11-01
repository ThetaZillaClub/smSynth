// components/training/layout/stage/analytics/charts/RhythmLineChart.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import MultiSeriesLines, { type Series } from "../../../../../ui/MultiSeriesLines";

/** Convert rhythm-fabric note values to UI labels (e.g., "eighth" -> "Eighth"). */
function noteValueToUiName(v: unknown): string | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const s = v.replace(/-/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined;
}

/** Map take event index → UI label from rhythm fabric (counting only note events). */
function makeIndexToLabel(rhythm: RhythmEvent[] | null | undefined): (idx: number) => string | undefined {
  const labels: string[] = [];
  if (Array.isArray(rhythm)) {
    for (const ev of rhythm) {
      // We only count true "note"-type events for index alignment with linePerEvent.idx
      if ((ev as any)?.type === "note") {
        const name = noteValueToUiName((ev as any)?.value);
        if (name) labels.push(name);
      }
    }
  }
  return (idx: number) => (idx >= 0 && idx < labels.length ? labels[idx] : undefined);
}

/** Nearest note-value labeling from seconds at current tempo. */
function makeSecondsToNoteLabel(bpm: number, den: number) {
  const beatSec = 60 / Math.max(1, bpm);
  const quarterSec = beatSec * (4 / Math.max(1, den));
  const candidates: Array<{ sec: number; name: string }> = [
    { sec: quarterSec * 4, name: "Whole" },
    { sec: quarterSec * 2, name: "Half" },
    { sec: quarterSec * 1, name: "Quarter" },
    { sec: quarterSec * 0.5, name: "Eighth" },
    { sec: quarterSec * 0.25, name: "Sixteenth" },
    { sec: quarterSec * 0.125, name: "Thirty-second" },
  ];
  return (sec: number): string | undefined => {
    if (!Number.isFinite(sec) || sec <= 0) return undefined;
    let best = candidates[0];
    let bestErr = Math.abs(sec - best.sec) / best.sec;
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const rel = Math.abs(sec - c.sec) / c.sec;
      if (rel < bestErr) { best = c; bestErr = rel; }
    }
    // ±25% tolerance around canonical values
    return bestErr <= 0.25 ? best.name : undefined;
  };
}

export default function RhythmLineChart({
  scores,
  snapshots,
  bpm,
  den,
  height = "100%",
  introEpoch = 0,
}: {
  scores: TakeScore[];
  snapshots: Array<{ rhythm: RhythmEvent[] | null }>;
  bpm: number;
  den: number;
  height?: number | string;
  introEpoch?: number;
}) {
  const noteLabelFromSec = React.useMemo(() => makeSecondsToNoteLabel(bpm, den), [bpm, den]);

  const series: Series[] = React.useMemo(() => {
    const nT = scores.length;
    const acc = new Map<string, Array<number | null>>(); // label -> values per take
    const order = new Map<string, number>(); let o = 0;

    for (let i = 0; i < nT; i++) {
      const s = scores[i]!;
      if (!s.rhythm.lineEvaluated) continue;
      const events = s.rhythm.linePerEvent ?? [];
      if (events.length === 0) continue;

      // Prefer rhythm fabric labels by event index
      const snapRhythm = snapshots?.[i]?.rhythm ?? null;
      const labelByIdx = makeIndexToLabel(snapRhythm);

      // Aggregate credit% by label within this take
      const perLabel = new Map<string, { sum: number; count: number }>();
      for (let j = 0; j < events.length; j++) {
        const ev = events[j]!;
        let label = labelByIdx(ev.idx);

        // Fallback: infer from IOI between expected onsets
        if (!label) {
          const next = j + 1 < events.length ? events[j + 1] : null;
          const durSec = next ? Math.max(0, (next.expSec ?? 0) - (ev.expSec ?? 0)) : NaN;
          const inferred = Number.isFinite(durSec) ? noteLabelFromSec(durSec as number) : undefined;
          label = inferred ?? undefined;
        }

        if (!label) continue; // skip unlabeled (non-canonical) IOIs

        if (!order.has(label)) order.set(label, o++);
        const creditPct = Math.max(0, Math.min(1, (ev.credit ?? 0))) * 100;
        const cell = perLabel.get(label) ?? { sum: 0, count: 0 };
        cell.sum += creditPct;
        cell.count += 1;
        perLabel.set(label, cell);
      }

      // Write this take’s averages into the cross-take accumulator
      for (const [label, g] of perLabel) {
        if (!acc.has(label)) acc.set(label, Array.from({ length: nT }, () => null));
        acc.get(label)![i] = g.count ? g.sum / g.count : null;
      }
    }

    // Stable series order by first-seen
    const all = Array.from(acc.entries())
      .map(([label, values]) => ({ label, values, ord: order.get(label) ?? 1e9 }))
      .sort((a, b) => a.ord - b.ord);

    // Show up to a handful of series if present (e.g., Quarter + Eighth)
    const MAX_SERIES = 4;
    return all.slice(0, MAX_SERIES).map(({ label, values }) => ({ label, values }));
  }, [scores, snapshots, noteLabelFromSec]);

  return (
    <MultiSeriesLines
      title="Rhythm line timing • by duration (per take)"
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
