// components/training/layout/stage/analytics/SessionAnalytics.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { letterFromPercent } from "@/utils/scoring/grade";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";

import Header from "./Header";
import HeaderCards from "./HeaderCards";
import NavCards, { type ViewKey } from "./NavCards";

import PerformanceOverTakesChart from "./charts/PerformanceOverTakesChart";
import PitchAccuracyChart from "./charts/PitchAccuracyChart";
import PitchPrecisionChart from "./charts/PitchPrecisionChart";
import MelodyCoverageChart from "./charts/MelodyCoverageChart";
import IntervalsChart from "./charts/IntervalsChart";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type TakeSnap = { phrase: Phrase; rhythm: RhythmEvent[] | null };

type Visibility = {
  showPitch: boolean;
  showIntervals: boolean;
  showMelodyRhythm: boolean;
  showRhythmLine: boolean; // only affects performance tooltip (no separate chart)
};

export default function SessionAnalytics({
  scores,
  snapshots,
  bpm,
  den,
  tonicPc,
  scaleName,
  /** NEW: analytics visibility gating (defaults: all on) */
  visibility = { showPitch: true, showIntervals: true, showMelodyRhythm: true, showRhythmLine: true },
}: {
  scores: TakeScore[];
  snapshots: TakeSnap[];
  bpm: number;
  den: number;
  tonicPc: number;
  scaleName: string | SolfegeScaleName;
  visibility?: Visibility;
}) {
  // ─────────── FIX: keep arrays aligned defensively ───────────
  const alignedCount = Math.max(0, Math.min(scores.length, snapshots.length));
  const sScores = React.useMemo(() => scores.slice(0, alignedCount), [scores, alignedCount]);
  const sSnaps  = React.useMemo(() => snapshots.slice(0, alignedCount), [snapshots, alignedCount]);

  const n = Math.max(1, sScores.length);
  const avg = (sel: (s: TakeScore) => number, dp = 1) =>
    Math.round((sScores.reduce((a, s) => a + sel(s), 0) / n) * Math.pow(10, dp)) / Math.pow(10, dp);

  const finalPct = avg((s) => s.final.percent);
  const finalLetter = letterFromPercent(finalPct);

  // top-level stats
  const pitchPct = avg((s) => s.pitch.percent);
  const timeOnPitchPct = Math.round((sScores.reduce((a, s) => a + s.pitch.timeOnPitchRatio, 0) / n) * 100);
  const pitchMae = Math.round(sScores.reduce((a, s) => a + s.pitch.centsMae, 0) / n);

  const melPct = avg((s) => s.rhythm.melodyPercent);
  const melHit = Math.round((sScores.reduce((a, s) => a + s.rhythm.melodyHitRate, 0) / n) * 100);
  const melMeanAbs = Math.round(sScores.reduce((a, s) => a + s.rhythm.melodyMeanAbsMs, 0) / n);

  const intervalsPct = avg((s) => clamp01(s.intervals.correctRatio) * 100);

  /* ─────────── dashboard state ─────────── */
  const [view, setView] = React.useState<ViewKey>("performance");
  const [introEpoch, setIntroEpoch] = React.useState(0);
  React.useEffect(() => { setIntroEpoch((e) => e + 1); }, [view]);

  // Allowed views based on visibility flags
  const availableViews = React.useMemo<ViewKey[]>(() => {
    const out: ViewKey[] = ["performance"];
    if (visibility.showPitch) { out.push("pitch-acc", "pitch-prec"); }
    if (visibility.showMelodyRhythm) { out.push("melody"); }
    if (visibility.showIntervals) { out.push("intervals"); }
    return out;
  }, [visibility]);

  // If current view is hidden by config, jump to the first available
  React.useEffect(() => {
    if (!availableViews.includes(view)) setView(availableViews[0] ?? "performance");
  }, [availableViews, view]);

  const railStyle = React.useMemo(
    () =>
      ({
        ["--ana-rail-h"]: "calc(5*clamp(52px,3vw,84px) + 4*0.5rem)",
      } as React.CSSProperties & { ["--ana-rail-h"]: string }),
    []
  );

  return (
    <div className="w-full h-full px-3 sm:px-4 md:px-6 flex flex-col gap-3 min-h-0">
      {/* Header */}
      <Header title="Lesson report" finalPct={finalPct} finalLetter={finalLetter} />

      {/* Stat chips (gated) */}
      <HeaderCards
        finalPct={finalPct}
        finalLetter={finalLetter}
        pitchPct={pitchPct}
        timeOnPitchPct={timeOnPitchPct}
        pitchMae={pitchMae}
        melPct={melPct}
        melHit={melHit}
        melMeanAbs={melMeanAbs}
        intervalsPct={intervalsPct}
        visibility={visibility}
      />

      {/* Two-column layout from md up: fixed picker rail + capped chart height */}
      <div
        className="grid gap-3 grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr] items-start flex-1 min-h-0"
        style={railStyle}
      >
        {/* Left rail: vertical picker */}
        <div className="min-h-0">
          <NavCards active={view} setActive={setView} available={availableViews} />
        </div>

        {/* Right: chart card — height capped to rail height from md↑ */}
        <div className="min-h-0 flex">
          <div className="rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-4 md:p-6 shadow-sm w-full min-h-0 overflow-hidden self-start md:h-[var(--ana-rail-h)]">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h3 className="text-lg md:text-xl font-semibold text-[#0f0f0f]">{{
                performance: "Performance over takes",
                "pitch-acc": "Pitch accuracy",
                "pitch-prec": "Pitch precision",
                melody: "Melody coverage",
                intervals: "Intervals",
              }[view]}</h3>
              <div className="text-xs md:text-sm text-[#373737]">{{
                performance: "Final score trend",
                "pitch-acc": "On-pitch% per note",
                "pitch-prec": "MAE (¢) per note",
                melody: "By duration per take",
                intervals: "Class accuracy per take",
              }[view]}</div>
            </div>

            <div className="h-[calc(100%-1.75rem)] min-h-0">
              {view === "performance" && (
                <PerformanceOverTakesChart
                  scores={sScores}
                  introEpoch={introEpoch}
                  visibility={visibility}
                />
              )}
              {view === "pitch-acc" && visibility.showPitch && (
                <PitchAccuracyChart
                  scores={sScores}
                  snapshots={sSnaps}
                  tonicPc={tonicPc}
                  scaleName={scaleName}
                  introEpoch={introEpoch}
                />
              )}
              {view === "pitch-prec" && visibility.showPitch && (
                <PitchPrecisionChart
                  scores={sScores}
                  snapshots={sSnaps}
                  tonicPc={tonicPc}
                  scaleName={scaleName}
                  introEpoch={introEpoch}
                />
              )}
              {view === "melody" && visibility.showMelodyRhythm && (
                <MelodyCoverageChart
                  scores={sScores}
                  snapshots={sSnaps}
                  bpm={bpm}
                  den={den}
                  introEpoch={introEpoch}
                />
              )}
              {view === "intervals" && visibility.showIntervals && (
                <IntervalsChart scores={sScores} introEpoch={introEpoch} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
