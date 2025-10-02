// components/training/take-review-layout/TakeReview.tsx
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
  canProceed?: boolean;
  onRetry?: () => void;
  onClose?: () => void;

  /** NEW: redo handler (jump back to this take’s exercise and run it again) */
  onRedo?: () => void;
};

export default function TakeReview({
  haveRhythm,
  onPlayMelody,
  onPlayRhythm,
  onPlayBoth,
  onStop,
  score,
  sessionScores = [],
  onClose,
  onRedo,             // ⬅️ NEW
}: Props) {
  const finalPct = score?.final?.percent ?? 0;
  const finalLetter = score?.final?.letter ?? "—";

  const pitchPct = score?.pitch?.percent ?? 0;
  const timeOnPitch = score?.pitch?.timeOnPitchRatio ?? 0;
  const centsMae = score?.pitch?.centsMae ?? 0;

  const melodyRhythmPct = score?.rhythm?.melodyPercent ?? 0;
  const lineEvaluated = !!score?.rhythm?.lineEvaluated;
  const lineRhythmPct = lineEvaluated ? score?.rhythm?.linePercent ?? 0 : null;

  const intervals = score?.intervals ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* Back link for list→detail flow */}
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

      {/* Header + redo button */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-base md:text-lg font-semibold text-[#0f0f0f]">
          Take review
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#ebebeb] px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
            {finalPct ? `${finalPct.toFixed(1)}%` : "—"}
          </span>
          <span className="text-xs text-[#373737]">
            {finalLetter !== "—" ? `(${finalLetter})` : ""}
          </span>

          {/* NEW: Redo button (only when handler provided) */}
          {onRedo ? (
            <button
              type="button"
              onClick={onRedo}
              className="ml-1 px-2.5 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-xs hover:bg-[#f8f8f8]"
              title="Load this exercise again and try it now"
            >
              Redo this take
            </button>
          ) : null}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-2">
        <StatTile
          label="Pitch"
          value={`${pitchPct.toFixed(1)}%`}
          detail={`On pitch ${(timeOnPitch * 100).toFixed(0)}% • MAE ${Math.round(centsMae)}¢`}
        />
        <StatTile
          label="Melody rhythm"
          value={`${melodyRhythmPct.toFixed(1)}%`}
          detail="Voiced coverage in note windows"
        />
        {haveRhythm && (
          <StatTile
            label="Rhythm line"
            value={lineRhythmPct != null ? `${lineRhythmPct.toFixed(1)}%` : "—"}
            detail={lineEvaluated ? "Hand taps vs. blue line" : "Not evaluated"}
          />
        )}
        <StatTile
          label="Intervals"
          value={intervals ? `${Math.round((intervals.correctRatio || 0) * 100)}%` : "—"}
          detail={intervals ? `${intervals.correct}/${intervals.total} correct` : "Not evaluated"}
        />
      </div>

      {/* Session chips */}
      {sessionScores.length ? (
        <div className="mt-1">
          <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-1">Session</div>
          <div className="flex flex-wrap gap-1.5">
            {sessionScores.map((s, i) => (
              <span key={i} className="px-2 py-0.5 text-xs rounded-md bg-[#ebebeb] text-[#0f0f0f] border border-[#dcdcdc]">
                {s.final?.percent?.toFixed(1) ?? "—"}%
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Playback */}
      <div className="mt-1">
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
          Playback
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <RoundIconButton title="Play melody" ariaLabel="Play melody" onClick={onPlayMelody}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
              <path d="M12 3v10.55A4 4 0 1 1 10 9V5l10-2v6.55A4 4 0 1 1 18 9V3l-6 1.2Z" fill="currentColor" />
            </svg>
          </RoundIconButton>

          {haveRhythm && (
            <RoundIconButton title="Play rhythm line" ariaLabel="Play rhythm line" onClick={onPlayRhythm}>
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
                <path d="M9 3h6l3 10H6L9 3Zm1.5 2L8.5 11h7L13.5 5H10.5Z" fill="currentColor" />
                <path d="M5 20h14v2H5z" fill="currentColor" />
              </svg>
            </RoundIconButton>
          )}

          {haveRhythm && (
            <RoundIconButton title="Play both" ariaLabel="Play both melody and rhythm" onClick={onPlayBoth}>
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
                <path d="M12 2l10 6-10 6L2 8l10-6Z" fill="currentColor" />
                <path d="M22 14l-10 6L2 14v2l10 6 10-6v-2Z" fill="currentColor" />
              </svg>
            </RoundIconButton>
          )}

          <RoundIconButton title="Stop" ariaLabel="Stop" onClick={onStop}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
              <rect x="6" y="6" width="12" height="12" fill="currentColor" />
            </svg>
          </RoundIconButton>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg bg-[#ebebeb] border border-[#dcdcdc] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{label}</div>
      <div className="text-sm md:text-base text-[#0f0f0f] font-semibold">{value}</div>
      {detail ? <div className="text-xs text-[#373737] mt-0.5">{detail}</div> : null}
    </div>
  );
}

function RoundIconButton({
  children,
  title,
  ariaLabel,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  ariaLabel: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center",
        "rounded-full p-2.5 bg-[#ebebeb] text-[#0f0f0f]",
        "hover:opacity-90 active:scale-[0.98] transition",
        "border border-[#dcdcdc] shadow-sm",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
