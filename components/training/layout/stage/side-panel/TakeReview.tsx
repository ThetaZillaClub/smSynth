// components/training/layout/stage/side-panel/TakeReview.tsx
"use client";
import React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";
// ⬇️ Point explicitly at the barrel file inside the folder
import {
  PitchReview,
  MelodyRhythmReview,
  RhythmLineReview,
  IntervalReview,
} from "./SidePanelScores/index";

export default function TakeReview({
  haveRhythm,
  onPlayMelody,
  onPlayRhythm,
  onPlayBoth,
  onStop,
  score,
  onClose,
  phrase,
  bpm,
  den,
  tonicPc = 0,
  scaleName = "major",
}: {
  haveRhythm: boolean;
  onPlayMelody: () => Promise<void> | void;
  onPlayRhythm: () => Promise<void> | void;
  onPlayBoth: () => Promise<void> | void;
  onStop: () => void;
  score?: TakeScore;
  onClose?: () => void;
  phrase?: Phrase | null;
  bpm: number;
  den: number;
  tonicPc?: number;
  scaleName?: SolfegeScaleName;
}) {
  const finalPct = score?.final?.percent ?? 0;
  const finalLetter = score?.final?.letter ?? "—";

  const pitchPct = score?.pitch?.percent ?? 0;
  const melodyRhythmPct = score?.rhythm?.melodyPercent ?? 0;
  const lineEvaluated = !!score?.rhythm?.lineEvaluated;
  const lineRhythmPct = lineEvaluated ? score?.rhythm?.linePercent ?? 0 : null;

  type View = "summary" | "pitch" | "melody" | "line" | "intervals";
  const [view, setView] = React.useState<View>("summary");

  return (
    <div className="flex flex-col gap-3">
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

      {/* Header / overall row */}
      <div className="flex items-center justify-between">
        <div className="text-base md:text-lg font-semibold text-[#0f0f0f]">
          {view === "summary"
            ? "Take review"
            : view === "pitch"
            ? "Pitch review"
            : view === "melody"
            ? "Melody rhythm review"
            : view === "line"
            ? "Rhythm line review"
            : "Interval review"}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#f8f8f8] shadow-sm px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
            {finalPct ? `${finalPct.toFixed(1)}%` : "—"}
          </span>
          <span className="text-xs text-[#373737]">
            {finalLetter !== "—" ? `(${finalLetter})` : ""}
          </span>
        </div>
      </div>

      {/* centered playback row under header */}
      <div className="flex items-center justify-center gap-2.5 flex-wrap py-1">
        <RoundIconButton title="Play melody" ariaLabel="Play melody" onClick={onPlayMelody}>
          <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
            <path
              d="M12 3v10.55A4 4 0 1 1 10 9V5l10-2v6.55A4 4 0 1 1 18 9V3l-6 1.2Z"
              fill="currentColor"
            />
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

      {view === "summary" ? (
        <div className="grid grid-cols-1 gap-2">
          <ClickableStatTile
            label="Pitch"
            value={`${pitchPct.toFixed(1)}%`}
            detail={`Open detailed pitch table`}
            onClick={() => setView("pitch")}
          />
          <ClickableStatTile
            label="Melody rhythm"
            value={`${melodyRhythmPct.toFixed(1)}%`}
            detail="Open per-note rhythm coverage"
            onClick={() => setView("melody")}
          />
          {haveRhythm && (
            <ClickableStatTile
              label="Rhythm line"
              value={lineRhythmPct != null ? `${lineRhythmPct.toFixed(1)}%` : "—"}
              detail={lineEvaluated ? "Open hand-tap timing" : "Not evaluated"}
              onClick={() => setView("line")}
            />
          )}
          <ClickableStatTile
            label="Intervals"
            value={`${Math.round((score?.intervals?.correctRatio || 0) * 100)}%`}
            detail={`${score?.intervals?.correct || 0}/${score?.intervals?.total || 0} correct • Open breakdown`}
            onClick={() => setView("intervals")}
          />
        </div>
      ) : view === "pitch" ? (
        <PitchReview score={score!} phrase={phrase ?? null} tonicPc={tonicPc} scaleName={scaleName} />
      ) : view === "melody" ? (
        <MelodyRhythmReview score={score!} phrase={phrase ?? null} bpm={bpm} den={den} />
      ) : view === "line" ? (
        <RhythmLineReview score={score!} />
      ) : (
        <IntervalReview score={score!} />
      )}
    </div>
  );
}

function ClickableStatTile({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg bg-[#f8f8f8] border border-[#dcdcdc] px-3 py-2 hover:shadow-sm transition"
    >
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{label}</div>
      <div className="text-sm md:text-base text-[#0f0f0f] font-semibold">{value}</div>
      {detail ? <div className="text-xs text-[#373737] mt-0.5">{detail}</div> : null}
    </button>
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
      className="inline-flex items-center justify-center rounded-full p-2.5 bg-[#f4f4f4] hover:bg-[#f8f8f8] text-[#0f0f0f] hover:opacity-90 active:scale-[0.98] transition border border-[#dcdcdc] shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]"
    >
      {children}
    </button>
  );
}
