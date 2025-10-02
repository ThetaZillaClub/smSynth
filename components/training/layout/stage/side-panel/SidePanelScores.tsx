// components/training/layout/stage/side-panel/SidePanelScores.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";

/**
 * SidePanelScores
 *
 * Compact list showing:
 *  - Overall % + letter (averaged across takes)
 *  - One row per take with % + letter
 * Clicking a row calls onOpen(index) so the parent can render TakeReview.
 *
 * Visual language matches the Courses cards (rounded, soft gray, subtle borders).
 */
export default function SidePanelScores({
  scores,
  onOpen,
}: {
  scores: TakeScore[];
  onOpen: (index: number) => void;
}) {
  const overallPercent = React.useMemo(() => {
    if (!scores.length) return null;
    const s = scores.reduce((a, b) => a + (b.final?.percent ?? 0), 0) / scores.length;
    return s;
  }, [scores]);

  const overallLetter = overallPercent == null ? "—" : percentToLetter(overallPercent);

  return (
    <div className="flex flex-col gap-3">
      {/* Overall */}
      <div className="rounded-xl bg-[#f2f2f2] border border-[#dcdcdc] p-3 shadow-sm">
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
          Overall
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#ebebeb] px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
            {overallPercent == null ? "—" : `${overallPercent.toFixed(1)}%`}
          </span>
          <span className="text-xs text-[#373737]">
            {overallPercent == null ? "" : `(${overallLetter})`}
          </span>
        </div>
      </div>

      {/* Takes list */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-1">Takes</div>

        {scores.length === 0 ? (
          <div className="rounded-xl bg-[#f2f2f2] border border-[#dcdcdc] p-3 shadow-sm text-sm text-[#373737]">
            Practice in progress. Your take scores will appear here.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {scores.map((s, i) => {
              const pct = s.final?.percent ?? null;
              const letter = s.final?.letter ?? (pct == null ? "—" : percentToLetter(pct));
              return (
                <button
                  key={i}
                  onClick={() => onOpen(i)}
                  className={[
                    "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
                    "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
                  ].join(" ")}
                  title={`Open take #${i + 1}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[#0f0f0f]">
                      Take {i + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-[#ebebeb] px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
                        {pct == null ? "—" : `${pct.toFixed(1)}%`}
                      </span>
                      <span className="text-xs text-[#373737]">
                        {letter ? `(${letter})` : ""}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Simple default letter bands (tweak if you have a central mapping) */
function percentToLetter(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 90) return "A";
  if (p >= 80) return "B";
  if (p >= 70) return "C";
  if (p >= 60) return "D";
  return "F";
}
