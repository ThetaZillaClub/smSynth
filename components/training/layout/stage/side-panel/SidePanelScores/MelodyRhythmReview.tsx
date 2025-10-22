// components/training/layout/stage/side-panel/SidePanelScores/MelodyRhythmReview.tsx
"use client";
import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import { secondsToNoteLabel } from "./format";

export default function MelodyRhythmReview({
  score,
  phrase,
  bpm,
  den,
}: {
  score: TakeScore;
  phrase: Phrase | null;
  bpm: number;
  den: number;
}) {
  const per = score.rhythm.perNoteMelody;
  const notes = phrase?.notes ?? [];

  // Remove " (~XX% match)" from secondsToNoteLabel output
  const cleanNoteLabel = React.useCallback(
    (sec: number) =>
      secondsToNoteLabel(sec, bpm, den).replace(/\s*\(~\d+% match\)\s*/i, ""),
    [bpm, den]
  );

  return (
    <div className="flex flex-col gap-2">
      <Header
        title="Melody rhythm (voicing in note windows)"
        main={`${score.rhythm.melodyPercent.toFixed(1)}%`}
        sub={`Hit ${(score.rhythm.melodyHitRate * 100).toFixed(0)}% • μ|Δt| ${Math.round(
          score.rhythm.melodyMeanAbsMs
        )}ms`}
      />
      <div
        className={[
          "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
          "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
        ].join(" ")}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[#6b6b6b]">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Duration</th>
              <th className="px-2 py-2">Coverage %</th>
              <th className="px-2 py-2">First-voice Δt</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n, i) => {
              const r = per?.[i];
              return (
                <tr key={i} className="border-t border-[#eee]">
                  <td className="px-2 py-1.5 align-middle text-[#555]">{i + 1}</td>
                  <td className="px-2 py-1.5 align-middle text-[#444]">
                    {cleanNoteLabel(n.durSec)}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {r ? `${(r.coverage * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {r?.onsetErrMs == null ? "—" : `${Math.round(Math.abs(r.onsetErrMs))}ms`}
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

function Header({ title, main, sub }: { title: string; main: string; sub?: string }) {
  return (
    <div
      className={[
        "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
        "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
      ].join(" ")}
    >
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{title}</div>
      <div className="text-sm md:text-base text-[#0f0f0f] font-semibold">{main}</div>
      {sub ? <div className="text-xs text-[#373737] mt-0.5">{sub}</div> : null}
    </div>
  );
}
