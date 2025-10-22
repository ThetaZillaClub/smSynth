// components/training/layout/stage/side-panel/take-review/ReviewStats.tsx
"use client";
import React, { useMemo } from "react";
import type { TakeScore } from "@/utils/scoring/score";
import {
  finalizeVisible,
  combinedRhythmPercentVisible,
} from "@/utils/scoring/final/finalize";

export default function ReviewStats({
  score,
  sessionScores = [],
  visibility = {
    showPitch: true,
    showIntervals: true,
    showMelodyRhythm: true,
    showRhythmLine: true,
  },
}: {
  score?: TakeScore | undefined;
  sessionScores?: TakeScore[];
  /** NEW: analytics visibility gating (optional; defaults to all true) */
  visibility?: {
    showPitch: boolean;
    showIntervals: boolean;
    showMelodyRhythm: boolean;
    showRhythmLine: boolean;
  };
}) {
  const masked = score ? finalizeVisible(score, visibility) : undefined;
  const rhythmVisible = visibility.showMelodyRhythm || visibility.showRhythmLine;

  const totals = useMemo(() => {
    if (!sessionScores.length) return null;
    const n = sessionScores.length;
    const avg = (xs: number[]) =>
      Math.round(((xs.reduce((a, b) => a + b, 0) / n) || 0) * 10) / 10;

    return {
      takes: n,
      pitchPct: avg(sessionScores.map((s) => s.pitch.percent)),
      rhythmPct: avg(
        sessionScores.map((s) =>
          combinedRhythmPercentVisible(s.rhythm, visibility)
        )
      ),
      finalPct: avg(sessionScores.map((s) => finalizeVisible(s, visibility).percent)),
    };
  }, [sessionScores, visibility]);

  return (
    <div className="mb-2">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
        Review
      </div>

      {score ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mt-1">
          <Chip
            title={`Final • ${masked?.letter ?? "—"}`}
            main={
              Number.isFinite(masked?.percent)
                ? `${masked!.percent.toFixed(1)}%`
                : "—"
            }
            sub={`(visibility-adjusted)`}
          />
          {visibility.showPitch && (
            <Chip
              title="Pitch accuracy"
              main={`${score.pitch.percent.toFixed(1)}%`}
              sub={`Time-on-pitch ${(score.pitch.timeOnPitchRatio * 100).toFixed(
                0
              )}% • MAE ${Math.round(score.pitch.centsMae)}¢`}
            />
          )}
          {visibility.showMelodyRhythm && (
            <Chip
              title="Rhythm (melody)"
              main={`${score.rhythm.melodyPercent.toFixed(1)}%`}
              sub={`Hit ${(score.rhythm.melodyHitRate * 100).toFixed(
                0
              )}% • μ|Δt| ${Math.round(score.rhythm.melodyMeanAbsMs)}ms`}
            />
          )}
          {visibility.showIntervals && (
            <Chip
              title="Intervals"
              main={`${(score.intervals.correctRatio * 100).toFixed(0)}%`}
              sub={`${score.intervals.correct}/${score.intervals.total} correct`}
            />
          )}
          {visibility.showRhythmLine && score.rhythm.lineEvaluated ? (
            <Chip
              title="Rhythm (blue line)"
              main={`${score.rhythm.linePercent.toFixed(1)}%`}
              sub={`Hit ${(score.rhythm.lineHitRate * 100).toFixed(
                0
              )}% • μ|Δt| ${Math.round(score.rhythm.lineMeanAbsMs)}ms`}
            />
          ) : null}
        </div>
      ) : (
        <div className="text-sm">
          Score: <span className="opacity-60">—</span>
        </div>
      )}

      {totals ? (
        <div
          className={[
            "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
            "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
          ].join(" ")}
        >
          <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-1">
            Session averages (based on {totals.takes} take
            {totals.takes === 1 ? "" : "s"})
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {visibility.showPitch && <span>Pitch {totals.pitchPct}%</span>}
            {rhythmVisible && <span>Rhythm {totals.rhythmPct}%</span>}
            <span>Final {totals.finalPct}%</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ title, main, sub }: { title: string; main: string; sub?: string }) {
  return (
    <div
      className={[
        "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
        "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
      ].join(" ")}
    >
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
        {title}
      </div>
      <div className="text-sm text-[#0f0f0f] font-semibold">{main}</div>
      {sub ? <div className="text-xs text-[#2d2d2d]">{sub}</div> : null}
    </div>
  );
}
