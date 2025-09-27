"use client";

import React from "react";
import type { TakeScore } from "@/utils/scoring/score";

type Props = {
  haveRhythm: boolean;
  onPlayMelody: () => Promise<void> | void;
  onPlayRhythm: () => Promise<void> | void;
  onPlayBoth: () => Promise<void> | void;
  onStop: () => void;
  onNext: () => void;
  score?: TakeScore;
  sessionScores?: TakeScore[];
  /** If provided, disables “Next” unless true. (Games can gate advancement.) */
  canProceed?: boolean;
  /** Optional retry action (if present we show a Retry button). */
  onRetry?: () => void;
};

export default function TakeReview({
  haveRhythm,
  onPlayMelody,
  onPlayRhythm,
  onPlayBoth,
  onStop,
  onNext,
  score,
  sessionScores = [],
  canProceed = true,
  onRetry,
}: Props) {
  const finalPct = score?.final?.percent ?? 0;
  const finalLetter = score?.final?.letter ?? "—";

  const pitchPct = score?.pitch?.percent ?? 0;
  const timeOnPitch = score?.pitch?.timeOnPitchRatio ?? 0;
  const centsMae = score?.pitch?.centsMae ?? 0;

  const rhythmPct = score?.rhythm?.combinedPercent ?? score?.rhythm?.melodyPercent ?? 0;

  const intervals = score?.intervals ?? null;

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-[#d2d2d2] bg-white p-3 shadow-sm">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">
          Take Review
          <span className="ml-2 text-sm font-normal text-[#2d2d2d]">
            {finalPct ? `${finalPct.toFixed(1)}%` : "—"} {finalLetter !== "—" ? `(${finalLetter})` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPlayMelody}
            className="px-2 py-1 text-sm rounded-md border border-[#d2d2d2] bg-[#f7f7f7] hover:bg-white"
            title="Play melody"
          >
            ▶︎ Melody
          </button>
          {haveRhythm && (
            <button
              onClick={onPlayRhythm}
              className="px-2 py-1 text-sm rounded-md border border-[#d2d2d2] bg-[#f7f7f7] hover:bg:white"
              title="Play rhythm line"
            >
              ▶︎ Rhythm
            </button>
          )}
          {haveRhythm && (
            <button
              onClick={onPlayBoth}
              className="px-2 py-1 text-sm rounded-md border border-[#d2d2d2] bg-[#f7f7f7] hover:bg:white"
              title="Play both"
            >
              ▶︎ Both
            </button>
          )}
          <button
            onClick={onStop}
            className="px-2 py-1 text-sm rounded-md border border-[#d2d2d2] bg-[#f0f0f0]"
            title="Stop"
          >
            ⏸ Stop
          </button>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <ScoreChip
          label="Pitch"
          primary={`${pitchPct.toFixed(1)}%`}
          secondary={`On pitch: ${(timeOnPitch * 100).toFixed(0)}% • Cents MAE: ${centsMae}`}
        />
        <ScoreChip
          label="Rhythm"
          primary={`${(rhythmPct || 0).toFixed(1)}%`}
          secondary={`${haveRhythm ? "Includes blue rhythm line" : "Melody only"}`}
        />
        <ScoreChip
          label="Intervals"
          primary={
            intervals
              ? `${Math.round((intervals.correctRatio || 0) * 100)}%`
              : "—"
          }
          secondary={
            intervals
              ? `${intervals.correct}/${intervals.total} correct`
              : "Not evaluated"
          }
        />
      </div>

      {/* Session history */}
      {sessionScores.length ? (
        <div className="rounded-md border border-[#e2e2e2] bg-[#fafafa] p-2">
          <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-1">Session</div>
          <div className="flex flex-wrap gap-2">
            {sessionScores.map((s, i) => (
              <span key={i} className="px-2 py-0.5 text-xs rounded-md border border-[#d2d2d2] bg-white">
                {s.final?.percent?.toFixed(1) ?? "—"}%
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-[#f7f7f7] text-sm hover:bg-white"
          >
            Retry
          </button>
        )}
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`px-3 py-1.5 rounded-md text-sm transition ${
            canProceed
              ? "bg-[#0f0f0f] text-white hover:opacity-90"
              : "bg-[#ebebeb] text-[#6b6b6b] cursor-not-allowed"
          }`}
          title={canProceed ? "Next round" : "Pass required to continue"}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function ScoreChip({ label, primary, secondary }: { label: string; primary: string; secondary?: string }) {
  return (
    <div className="rounded-md border border-[#d2d2d2] bg-[#f9f9f9] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{label}</div>
      <div className="text-sm text-[#0f0f0f]">{primary}</div>
      {secondary ? <div className="text-xs text-[#2d2d2d]">{secondary}</div> : null}
    </div>
  );
}
