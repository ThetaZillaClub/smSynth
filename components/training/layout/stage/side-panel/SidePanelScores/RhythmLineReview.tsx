// components/training/layout/stage/side-panel/SidePanelScores/RhythmLineReview.tsx
"use client";
import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";

function noteValueToUiName(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  const s = v.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Map take event index → UI label from rhythm fabric (by counting note events). */
function makeIndexToLabel(rhythm: RhythmEvent[] | null | undefined): (idx: number) => string {
  const labels: string[] = [];
  if (Array.isArray(rhythm)) {
    for (const ev of rhythm) {
      if ((ev as any)?.type === "note") {
        labels.push(noteValueToUiName((ev as any)?.value));
      }
    }
  }
  return (idx: number) => (idx >= 0 && idx < labels.length ? labels[idx]! : "—");
}

export default function RhythmLineReview({
  score,
  lineRhythm = null, // ← pass the actual “blue line” rhythm fabric when available
}: {
  score: TakeScore;
  lineRhythm?: RhythmEvent[] | null;
}) {
  if (!score.rhythm.lineEvaluated) {
    return (
      <div
        className={[
          "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
          "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
        ].join(" ")}
      >
        <div className="text-sm">Rhythm line was not evaluated for this take.</div>
      </div>
    );
  }

  const rows = score.rhythm.linePerEvent ?? [];
  const labelFor = React.useMemo(() => makeIndexToLabel(lineRhythm), [lineRhythm]);

  return (
    <div className="flex flex-col gap-2">
      <Header
        title="Rhythm line (hand taps vs. blue line)"
        main={`${score.rhythm.linePercent.toFixed(1)}%`}
        sub={`Hit ${(score.rhythm.lineHitRate * 100).toFixed(0)}% • μ|Δt| ${Math.round(
          score.rhythm.lineMeanAbsMs
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
              <th className="px-2 py-2">Value</th>
              <th className="px-2 py-2">Δt (ms)</th>
              <th className="px-2 py-2">Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#eee]">
                <td className="px-2 py-1.5" colSpan={4}>
                  No onsets to evaluate.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const dt = r.errMs == null ? "—" : Math.round(r.errMs).toString();
                const creditPct = `${Math.round((r.credit ?? 0) * 100)}%`;
                return (
                  <tr key={i} className="border-t border-[#eee]">
                    <td className="px-2 py-1.5 text-[#555]">{r.idx + 1}</td>
                    <td className="px-2 py-1.5">{labelFor(r.idx)}</td>
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
        Tip: Hit rate counts expected notes that have a sufficiently close tap. Mean absolute error
        summarizes timing deviation for those hits.
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
