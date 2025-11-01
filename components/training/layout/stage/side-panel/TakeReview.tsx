// components/training/layout/stage/side-panel/TakeReview.tsx
"use client";
import React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { finalizeVisible } from "@/utils/scoring/final/finalize";
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
  /** Provide the real rhythm fabrics when available so reviews can label from fabric (no guessing) */
  lineRhythm = null,
  melodyRhythm = null,
  /** NEW: analytics visibility gating */
  visibility = {
    showPitch: true,
    showIntervals: true,
    showMelodyRhythm: true,
    showRhythmLine: true,
  },
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
  /** Rhythm fabrics (optional but preferred) */
  lineRhythm?: RhythmEvent[] | null;
  melodyRhythm?: RhythmEvent[] | null;
  /** NEW: analytics visibility gating */
  visibility?: {
    showPitch: boolean;
    showIntervals: boolean;
    showMelodyRhythm: boolean;
    showRhythmLine: boolean;
  };
}) {
  // Visibility-aware final (fixes 0% → "—" bug)
  const masked = score ? finalizeVisible(score, visibility) : undefined;
  const finalPct = masked?.percent ?? NaN;
  const finalLetter = masked?.letter ?? "—";

  const pitchPct = score?.pitch?.percent ?? 0;
  const melodyRhythmPct = score?.rhythm?.melodyPercent ?? 0;
  const lineEvaluated = !!score?.rhythm?.lineEvaluated;
  const lineRhythmPct = lineEvaluated ? score?.rhythm?.linePercent ?? 0 : null;

  type View = "summary" | "pitch" | "melody" | "line" | "intervals";
  const [view, setView] = React.useState<View>("summary");

  // If a hidden view is somehow selected (e.g., via back/forward), bounce to summary
  React.useEffect(() => {
    if (view === "melody" && !visibility.showMelodyRhythm) setView("summary");
    if (view === "line" && !visibility.showRhythmLine) setView("summary");
    if (view === "intervals" && !visibility.showIntervals) setView("summary");
  }, [view, visibility]);

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

      {/* Header */}
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
          <span className="inline-flex items-center rounded-full bg-[#f2f2f2] border border-[#dcdcdc] shadow-sm px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
            {Number.isFinite(finalPct) ? `${finalPct.toFixed(1)}%` : "—"}
          </span>
          <span className="text-xs text-[#373737]">
            {finalLetter !== "—" ? `(${finalLetter})` : ""}
          </span>
        </div>
      </div>

      {/* centered playback row under header */}
      <div className="flex items-center justify-center gap-2.5 flex-wrap py-1">
        <RoundIconButton title="Play melody" ariaLabel="Play melody" onClick={onPlayMelody}>
          <IconPlayMelody className="w-9 h-9" aria-hidden />
        </RoundIconButton>

        {haveRhythm && visibility.showRhythmLine && (
          <RoundIconButton title="Play rhythm line" ariaLabel="Play rhythm line" onClick={onPlayRhythm}>
            <IconPlayRhythm className="w-9 h-9" aria-hidden />
          </RoundIconButton>
        )}

        {haveRhythm && visibility.showRhythmLine && (
          <RoundIconButton title="Play both" ariaLabel="Play both melody and rhythm" onClick={onPlayBoth}>
            <IconPlayBoth className="w-9 h-9" aria-hidden />
          </RoundIconButton>
        )}

        <RoundIconButton title="Stop" ariaLabel="Stop" onClick={onStop}>
          {/* keep stop but scale icon only, not button */}
          <svg viewBox="0 0 24 24" className="w-9 h-9" aria-hidden>
            <rect x="6" y="6" width="12" height="12" fill="currentColor" />
          </svg>
        </RoundIconButton>
      </div>

      {view === "summary" ? (
        <div className="grid grid-cols-1 gap-2">
          {/* Pitch — always */}
          <ClickableStatTile
            label="Pitch"
            value={`${pitchPct.toFixed(1)}%`}
            detail={`Open detailed pitch table`}
            onClick={() => setView("pitch")}
          />

          {/* Melody rhythm — gated */}
          {visibility.showMelodyRhythm && (
            <ClickableStatTile
              label="Melody rhythm"
              value={`${melodyRhythmPct.toFixed(1)}%`}
              detail="Open per-note timing"
              onClick={() => setView("melody")}
            />
          )}

          {/* Rhythm line — gated */}
          {visibility.showRhythmLine && (
            <ClickableStatTile
              label="Rhythm line"
              value={lineRhythmPct != null ? `${lineRhythmPct.toFixed(1)}%` : "—"}
              detail={lineEvaluated ? "Open hand-tap timing" : "Not evaluated"}
              onClick={() => setView("line")}
            />
          )}

          {visibility.showIntervals && (
            <ClickableStatTile
              label="Intervals"
              value={`${Math.round((score?.intervals?.correctRatio || 0) * 100)}%`}
              detail={`${score?.intervals?.correct || 0}/${score?.intervals?.total || 0} correct • Open breakdown`}
              onClick={() => setView("intervals")}
            />
          )}
        </div>
      ) : view === "pitch" ? (
        <PitchReview score={score!} phrase={phrase ?? null} tonicPc={tonicPc} scaleName={scaleName} />
      ) : view === "melody" ? (
        visibility.showMelodyRhythm ? (
          <MelodyRhythmReview
            score={score!}
            phrase={phrase ?? null}
            bpm={bpm}
            den={den}
            melodyRhythm={melodyRhythm}
          />
        ) : null
      ) : view === "line" ? (
        visibility.showRhythmLine ? (
          <RhythmLineReview
            score={score!}
            lineRhythm={lineRhythm}
          />
        ) : null
      ) : view === "intervals" ? (
        visibility.showIntervals ? <IntervalReview score={score!} /> : null
      ) : null}
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
      className={[
        "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
        "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
      ].join(" ")}
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
      // Fixed outer size (≈40px) so the button footprint stays the same;
      // no padding; icon scales inside via its own w/h classes.
      className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#f4f4f4] hover:bg-[#f8f8f8] text-[#0f0f0f] hover:opacity-90 active:scale-[0.98] transition border border-[#dcdcdc] shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]"
    >
      {children}
    </button>
  );
}

/* Icons unchanged ... */
function IconPlayMelody(props: React.SVGProps<SVGSVGElement>) { /* ... */ return (
  <svg viewBox="0 0 512 512" {...props}><path fill="currentColor" d="M385.1,254.3l-86.3-49.8v71.6c0,3.6-0.6,7.3-1.8,11c-1.1,3.6-2.9,7.2-5.3,10.7c-6.6,9.8-17.1,17.5-29.5,21.8
        c-6.8,2.4-13.7,3.6-20.6,3.6c-19.2,0-35-9.6-40.2-24.5c-4.7-13.5-0.1-28.6,12.1-40.4c6.1-6,14-10.7,22.6-13.7
        c4.1-1.4,8.3-2.4,12.5-3v-66l-55.6-32.1c-9.6-5.6-21.7,1.4-21.7,12.5v221.6c0,11.1,12,18.1,21.7,12.5l191.9-110.8
        C394.8,273.8,394.8,259.9,385.1,254.3z" /><path fill="currentColor" d="M256,41C137.3,41,41,137.3,41,256s96.3,215,215,215s215-96.3,215-215S374.7,41,256,41z M256,435
        c-98.9,0-179-80.2-179-179S157.1,77,256,77s179,80.2,179,179S354.9,435,256,435z" /><path fill="currentColor" d="M220.5,265.5c-9,8.7-13.1,19.9-9.6,29.9c5.4,15.5,26.9,22.1,48.1,14.8c10.7-3.7,19.3-10.3,24.5-17.9
        c1.8-2.6,3.2-5.4,4-8.2c0.9-2.6,1.3-5.3,1.3-7.9V154.6l11-1.2l30.8-3.3v-30.2l-41.9,4.5l-30,3.3v123.4c-6.1-0.3-12.7,0.7-19.3,3
        C232,256.6,225.5,260.6,220.5,265.5z" /></svg>
); }
function IconPlayRhythm(props: React.SVGProps<SVGSVGElement>) { /* ... */ return (
  <svg viewBox="0 0 512 512" {...props}><path fill="currentColor" d="M256,86.4c-83.6,0-151.7,68-151.7,151.7v160.8h36.6V238.1c0-63.5,51.6-115.1,115.1-115.1
        c63.5,0,115.1,51.6,115.1,115.1v160.8h36.6V238.1C407.7,154.5,339.6,86.4,256,86.4z" /><path fill="currentColor" d="M41.9,336.3c0,31.1,22.7,56.9,52.4,61.8V274.4c-13.2,2.2-25,8.5-34,17.5C48.9,303.3,41.9,318.9,41.9,336.3z" /><path fill="currentColor" d="M451.7,291.9c-9.1-9-20.9-15.4-34.1-17.5v123.7c29.7-4.9,52.4-30.7,52.4-61.8
        C470.1,318.9,463.1,303.3,451.7,291.9z" /><path fill="currentColor" d="M256.9,247.9c-49.1,0-88.8,39.8-88.8,88.8c0,49.1,39.8,88.8,88.8,88.8s88.8-39.8,88.8-88.8
        C345.7,287.7,306,247.9,256.9,247.9z M326.4,357.8c-1,1-2.3,1.5-3.5,1.5s-2.6-0.5-3.5-1.5l-31.5-31.5l-27.4,27.4c-2,2-5.1,2-7.1,0
        L226,326.3l-31.5,31.5c-2,2-5.1,2-7.1,0c-2-2-2-5.1,0-7.1l35-35c2-2,5.1-2,7.1,0l35,35
        C328.3,352.7,328.3,355.8,326.4,357.8z" /></svg>
); }
function IconPlayBoth(props: React.SVGProps<SVGSVGElement>) { /* ... */ return (
  <svg viewBox="0 0 512 512" {...props}><path fill="currentColor" d="M465.7,195.1V237l-58,6.3v168.3c0,7.6-2.7,15.3-7.4,22.3c-7.1,10.5-19,19.7-33.9,24.8
        c-29.3,10.2-59.1,1-66.6-20.4c-7.5-21.5,10.3-47.1,39.6-57.3c9.1-3.2,18.2-4.5,26.7-4.1V205.9l41.6-4.5L465.7,195.1z" /><path fill="currentColor" d="M325.9,49.1v214.1c0,7.6-2.7,15.3-7.4,22.3c-7.1,10.6-19,19.7-33.9,24.8c-29.3,10.2-59.1,1-66.6-20.4
        c-7.5-21.5,10.3-47.1,39.6-57.3c9.1-3.2,18.2-4.5,26.7-4.1v-133l-128.4,13.9v168.3c0,7.6-2.7,15.3-7.4,22.3
        c-7.1,10.5-19,19.7-33.9,24.8c-29.3,10.2-59.1,1-66.6-20.4c-7.5-21.5,10.3-47.1,39.6-57.3c9.1-3.2,18.2-4.5,26.7-4.1V72l41.6-4.5
        l128.4-13.9L325.9,49.1z" /><circle fill="currentColor" cx="178.3" cy="353.1" r="18.9" /><circle fill="currentColor" cx="269.9" cy="362.4" r="12.1" /><circle fill="currentColor" cx="442.7" cy="66.1" r="12.1" /><circle fill="currentColor" cx="221.5" cy="425.3" r="28.3" /><circle fill="currentColor" cx="389.6" cy="126.8" r="28.3" /></svg>
); }
