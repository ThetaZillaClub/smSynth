// components/training/layout/stage/side-panel/SidePanelScores.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import { letterFromPercent } from "@/utils/scoring/grade";
import { finalizeVisible } from "@/utils/scoring/final/finalize";

/**
 * SidePanelScores
 *
 * Compact list showing:
 *  - Overall % + letter (averaged across takes; visibility-aware)
 *  - One row per take with % + letter (visibility-aware)
 */

export default function SidePanelScores({
  scores,
  onOpen,
  visibility = {
    showPitch: true,
    showIntervals: true,
    showMelodyRhythm: true,
    showRhythmLine: true,
  },
}: {
  scores: TakeScore[];
  /** onOpen(index): 0..N-1 = take detail, -1 = overall session detail */
  onOpen: (index: number) => void;
  visibility?: {
    showPitch: boolean;
    showIntervals: boolean;
    showMelodyRhythm: boolean;
    showRhythmLine: boolean;
  };
}) {
  const overallPercent = React.useMemo(() => {
    if (!scores.length) return null;
    return (
      scores.reduce((a, s) => a + finalizeVisible(s, visibility).percent, 0) /
      scores.length
    );
  }, [scores, visibility]);

  const overallLetter =
    overallPercent == null ? "—" : letterFromPercent(overallPercent);
  const canOpenOverall = scores.length >= 2;

  return (
    <div className="flex flex-col gap-3">
      {/* Overall */}
      <button
        type="button"
        disabled={!canOpenOverall}
        onClick={() => canOpenOverall && onOpen(-1)}
        className={[
          "rounded-xl border border-[#dcdcdc] p-3 shadow-sm text-left",
          canOpenOverall
            ? "bg-[#f2f2f2] hover:shadow-md active:scale-[0.99] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]"
            : "bg-[#f5f5f5] opacity-80 cursor-not-allowed",
        ].join(" ")}
        title={
          canOpenOverall
            ? "Open overall session stats"
            : "Overall details unlock after 2 takes"
        }
      >
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
          Overall
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#ebebeb] px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
            {overallPercent == null || !Number.isFinite(overallPercent)
              ? "—"
              : `${overallPercent.toFixed(1)}%`}
          </span>
          <span className="text-xs text-[#373737]">
            {overallPercent == null || !Number.isFinite(overallPercent)
              ? ""
              : `(${overallLetter})`}
          </span>
          {canOpenOverall && (
            <span className="ml-1 text-[11px] text-[#6b6b6b]">(click for details)</span>
          )}
        </div>
      </button>

      {/* Takes list */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-1">
          Takes
        </div>

        {scores.length === 0 ? (
          <div className="rounded-xl bg-[#f2f2f2] border border-[#dcdcdc] p-3 shadow-sm text-sm text-[#373737]">
            Practice in progress. Your take scores will appear here.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {scores.map((s, i) => {
              const masked = finalizeVisible(s, visibility);
              const pct = masked.percent;
              const letter = masked.letter;

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
                        {Number.isFinite(pct) ? `${pct.toFixed(1)}%` : "—"}
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
