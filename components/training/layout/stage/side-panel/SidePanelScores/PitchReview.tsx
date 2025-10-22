// components/training/layout/stage/side-panel/SidePanelScores/PitchReview.tsx
"use client";
import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import { pcToSolfege, type SolfegeScaleName } from "@/utils/lyrics/solfege";
import { midiLabelForKey } from "@/utils/pitch/enharmonics";

export default function PitchReview({
  score,
  phrase,
  tonicPc,
  scaleName,
}: {
  score: TakeScore;
  phrase: Phrase | null;
  tonicPc: number;
  scaleName: SolfegeScaleName;
}) {
  const per = score.pitch.perNote;

  type Acc = {
    key: string;        // label|solf
    label: string;      // e.g., "E3"
    solf: string;       // e.g., "sol"
    order: number;      // first occurrence index for stable ordering
    n: number;
    meanRatio: number;  // running mean (0..1)
    meanMae: number;    // running mean (cents)
  };

  const groups = React.useMemo(() => {
    const notes = phrase?.notes ?? [];
    const m = new Map<string, Acc>();

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i]!;
      const p = per?.[i];
      if (!p) continue;

      const pcAbs = ((Math.round(n.midi) % 12) + 12) % 12;
      const solf = pcToSolfege(pcAbs, tonicPc, scaleName, { caseStyle: "lower" });
      const label = midiLabelForKey(Math.round(n.midi), tonicPc, scaleName).text;
      const key = `${label}|${solf}`;

      if (!m.has(key)) {
        m.set(key, { key, label, solf, order: i, n: 0, meanRatio: 0, meanMae: 0 });
      }
      const g = m.get(key)!;

      // Incremental means
      g.n += 1;
      g.meanRatio += (p.ratio - g.meanRatio) / g.n;
      g.meanMae += (p.centsMae - g.meanMae) / g.n;
    }

    return Array.from(m.values()).sort((a, b) => a.order - b.order);
  }, [phrase, per, tonicPc, scaleName]);

  return (
    <div className="flex flex-col gap-2">
      <Header
        title="Pitch review"
        main={`${score.pitch.percent.toFixed(1)}%`}
        sub={`On pitch ${(score.pitch.timeOnPitchRatio * 100).toFixed(0)}% • MAE ${Math.round(
          score.pitch.centsMae
        )}¢`}
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
              <th className="px-2 py-2">Note</th>
              <th className="px-2 py-2">Solfege</th>
              <th className="px-2 py-2">On-pitch %</th>
              <th className="px-2 py-2">MAE (¢)</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr className="border-t border-[#eee]">
                <td className="px-2 py-1.5" colSpan={5}>No notes to evaluate.</td>
              </tr>
            ) : (
              groups.map((g, i) => (
                <tr key={g.key} className="border-t border-[#eee]">
                  <td className="px-2 py-1.5 align-middle text-[#555]">{i + 1}</td>
                  <td className="px-2 py-1.5 align-middle font-medium">{g.label}</td>
                  <td className="px-2 py-1.5 align-middle">{g.solf}</td>
                  <td className="px-2 py-1.5 align-middle">{(g.meanRatio * 100).toFixed(1)}%</td>
                  <td className="px-2 py-1.5 align-middle">{Math.round(g.meanMae)}</td>
                </tr>
              ))
            )}
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
