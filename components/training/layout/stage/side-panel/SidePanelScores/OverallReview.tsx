// components/training/layout/stage/side-panel/SidePanelScores/OverallReview.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import { letterFromPercent } from "@/utils/scoring/grade";
import { intervalLabel } from "./format";

export default function OverallReview({
  scores,
  onClose,
}: {
  scores: TakeScore[];
  onClose?: () => void;
}) {
  // ────────────────────────────────────────────────────────────────────────────
  // Averages (plain mean across takes)
  const n = scores.length || 1;
  const avg = (sel: (s: TakeScore) => number) =>
    Math.round((scores.reduce((a, s) => a + sel(s), 0) / n) * 10) / 10;

  const finalPct = avg((s) => s.final.percent);
  const finalLetter = letterFromPercent(finalPct);

  const pitchPct = avg((s) => s.pitch.percent);
  const timeOnPitchPct = Math.round(
    (scores.reduce((a, s) => a + s.pitch.timeOnPitchRatio, 0) / n) * 100
  );
  const pitchMae = Math.round(scores.reduce((a, s) => a + s.pitch.centsMae, 0) / n);

  const melPct = avg((s) => s.rhythm.melodyPercent);
  const melHit = Math.round((scores.reduce((a, s) => a + s.rhythm.melodyHitRate, 0) / n) * 100);
  const melMeanAbs = Math.round(scores.reduce((a, s) => a + s.rhythm.melodyMeanAbsMs, 0) / n);

  const lineSamples = scores.filter((s) => s.rhythm.lineEvaluated);
  const haveLine = lineSamples.length > 0;
  const lineN = lineSamples.length || 1;
  const linePct = haveLine
    ? Math.round(
        (lineSamples.reduce((a, s) => a + s.rhythm.linePercent, 0) / lineN) * 10
      ) / 10
    : 0;
  const lineHit = haveLine
    ? Math.round(
        (lineSamples.reduce((a, s) => a + s.rhythm.lineHitRate, 0) / lineN) * 100
      )
    : 0;
  const lineMeanAbs = haveLine
    ? Math.round(lineSamples.reduce((a, s) => a + s.rhythm.lineMeanAbsMs, 0) / lineN)
    : 0;

  // Intervals: (1) header = mean of per-take %, (2) table = summed attempts/correct per class
  const intervalsPct = Math.round(
    (scores.reduce((a, s) => a + s.intervals.correctRatio * 100, 0) / n) * 10
  ) / 10;

  type Acc = { attempts: number; correct: number };
  const byClass = new Map<number, Acc>();
  for (let i = 0; i <= 12; i++) byClass.set(i, { attempts: 0, correct: 0 });

  for (const s of scores) {
    for (const c of s.intervals.classes ?? []) {
      const cell = byClass.get(c.semitones)!;
      cell.attempts += c.attempts || 0;
      cell.correct += c.correct || 0;
    }
  }
  const classRows = Array.from(byClass.entries())
    .map(([semitones, v]) => ({
      semitones,
      label: intervalLabel(semitones),
      attempts: v.attempts,
      correct: v.correct,
      percent: v.attempts ? Math.round((100 * v.correct) / v.attempts) : 0,
    }))
    .filter((r) => r.attempts > 0);

  return (
    <div className="flex flex-col gap-3">
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="self-start text-xs text-[#373737] hover:underline"
          title="Back to takes"
        >
          ← Back to takes
        </button>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-base md:text-lg font-semibold text-[#0f0f0f]">
          Overall session (averages across {scores.length} takes)
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#f8f8f8] shadow-sm px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
            {finalPct.toFixed(1)}%
          </span>
          <span className="text-xs text-[#373737]">{`(${finalLetter})`}</span>
        </div>
      </div>

      {/* Summary chips */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Chip
          title={`Final • ${finalLetter}`}
          main={`${finalPct.toFixed(1)}%`}
          sub={`(Average of take finals)`}
        />
        <Chip
          title="Pitch accuracy"
          main={`${pitchPct.toFixed(1)}%`}
          sub={`Time-on-pitch ${timeOnPitchPct}% • MAE ${pitchMae}¢`}
        />
        <Chip
          title="Rhythm (melody)"
          main={`${melPct.toFixed(1)}%`}
          sub={`Hit ${melHit}% • μ|Δt| ${melMeanAbs}ms`}
        />
        <Chip
          title="Intervals"
          main={`${intervalsPct.toFixed(1)}%`}
          sub={`(Avg of take interval %)`}
        />
        {haveLine ? (
          <Chip
            title="Rhythm (blue line)"
            main={`${linePct.toFixed(1)}%`}
            sub={`Hit ${lineHit}% • μ|Δt| ${lineMeanAbs}ms`}
          />
        ) : null}
      </div>

      {/* Intervals aggregate table */}
      <div className="rounded-lg border border-[#dcdcdc] bg-white/70 mt-1">
        <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-[#6b6b6b]">
          Intervals — aggregated across all takes
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[#6b6b6b]">
              <th className="px-2 py-2">Interval</th>
              <th className="px-2 py-2">Attempts</th>
              <th className="px-2 py-2">Correct</th>
              <th className="px-2 py-2">% Correct</th>
            </tr>
          </thead>
          <tbody>
            {classRows.length === 0 ? (
              <tr className="border-t border-[#eee]">
                <td className="px-2 py-1.5" colSpan={4}>
                  No interval attempts yet.
                </td>
              </tr>
            ) : (
              classRows.map((r) => (
                <tr key={r.semitones} className="border-t border-[#eee]">
                  <td className="px-2 py-1.5 align-middle font-medium">{r.label}</td>
                  <td className="px-2 py-1.5 align-middle">{r.attempts}</td>
                  <td className="px-2 py-1.5 align-middle">{r.correct}</td>
                  <td className="px-2 py-1.5 align-middle">{r.percent}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-[#444]">
        Notes: Averages are simple means across takes; interval table sums attempts/correct
        across the session. Rhythm line averages include only takes where the line was evaluated.
      </div>
    </div>
  );
}

function Chip({ title, main, sub }: { title: string; main: string; sub?: string }) {
  return (
    <div className="rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{title}</div>
      <div className="text-sm text-[#0f0f0f] font-semibold">{main}</div>
      {sub ? <div className="text-xs text-[#2d2d2d]">{sub}</div> : null}
    </div>
  );
}
