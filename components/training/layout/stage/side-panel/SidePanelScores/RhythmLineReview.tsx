// components/training/layout/stage/side-panel/SidePanelScores/RhythmLineReview.tsx
"use client";
import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";

export default function RhythmLineReview({ score }: { score: TakeScore }) {
  if (!score.rhythm.lineEvaluated) {
    return (
      <div className="rounded-lg bg-[#f8f8f8] border border-[#dcdcdc] px-3 py-2 text-sm">
        Rhythm line was not evaluated for this take.
      </div>
    );
  }

  const rows = score.rhythm.linePerEvent ?? [];

  return (
    <div className="flex flex-col gap-2">
      <Header
        title="Rhythm line (hand taps vs. blue line)"
        main={`${score.rhythm.linePercent.toFixed(1)}%`}
        sub={`Hit ${(score.rhythm.lineHitRate * 100).toFixed(0)}% • μ|Δt| ${Math.round(
          score.rhythm.lineMeanAbsMs
        )}ms`}
      />

      <div className="rounded-lg border border-[#dcdcdc] bg-white/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[#6b6b6b]">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Expected</th>
              <th className="px-2 py-2">Tap</th>
              <th className="px-2 py-2">Δt (ms)</th>
              <th className="px-2 py-2">Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#eee]">
                <td className="px-2 py-1.5" colSpan={5}>No onsets to evaluate.</td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const dt = r.errMs == null ? "—" : Math.round(r.errMs).toString();
                const creditPct = `${Math.round(r.credit * 100)}%`;
                return (
                  <tr key={i} className="border-t border-[#eee]">
                    <td className="px-2 py-1.5 text-[#555]">{r.idx + 1}</td>
                    <td className="px-2 py-1.5">{r.expSec.toFixed(3)}s</td>
                    <td className="px-2 py-1.5">{r.tapSec == null ? "—" : `${r.tapSec.toFixed(3)}s`}</td>
                    <td className="px-2 py-1.5">{dt}</td>
                    <td className="px-2 py-1.5">{creditPct}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-[#444]">
        Tip: Hit rate counts expected beats that have a sufficiently close tap. Mean absolute error
        summarizes timing deviation for those hits.
      </div>
    </div>
  );
}

function Header({ title, main, sub }: { title: string; main: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-[#f8f8f8] border border-[#dcdcdc] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{title}</div>
      <div className="text-sm md:text-base text-[#0f0f0f] font-semibold">{main}</div>
      {sub ? <div className="text-xs text-[#373737] mt-0.5">{sub}</div> : null}
    </div>
  );
}
