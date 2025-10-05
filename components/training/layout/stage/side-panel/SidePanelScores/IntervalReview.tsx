// components/training/layout/stage/side-panel/SidePanelScores/IntervalReview.tsx
"use client";
import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import { intervalLabel } from "./format";

export default function IntervalReview({ score }: { score: TakeScore }) {
  const base = score.intervals;
  const classes = base.classes;

  return (
    <div className="flex flex-col gap-2">
      <Header
        title="Intervals"
        main={`${Math.round((base.correctRatio || 0) * 100)}%`}
        sub={`${base.correct}/${base.total} correct`}
      />
      <div className="rounded-lg border border-[#dcdcdc] bg-white/70">
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
            {(classes && classes.length ? classes : DEFAULT_CLASSES).map((c, i) => {
              const row =
                classes?.find((x) => x.semitones === c.semitones) ?? c;
              return (
                <tr key={i} className="border-t border-[#eee]">
                  <td className="px-2 py-1.5 align-middle font-medium">
                    {intervalLabel(row.semitones)}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {row.attempts ?? 0}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {row.correct ?? 0}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {Number.isFinite(row.percent)
                      ? `${row.percent.toFixed(0)}%`
                      : "0%"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Show 0..12 when no data is available, for consistency with runtime buckets
const DEFAULT_CLASSES = Array.from({ length: 13 }, (_, i) => ({
  semitones: i,
  label: intervalLabel(i),
  attempts: 0,
  correct: 0,
  percent: 0,
}));

function Header({
  title,
  main,
  sub,
}: {
  title: string;
  main: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-[#f8f8f8] border border-[#dcdcdc] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
        {title}
      </div>
      <div className="text-sm md:text-base text-[#0f0f0f] font-semibold">
        {main}
      </div>
      {sub ? <div className="text-xs text-[#373737] mt-0.5">{sub}</div> : null}
    </div>
  );
}
