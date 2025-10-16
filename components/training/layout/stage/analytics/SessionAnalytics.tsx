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

export default function SessionAnalytics({
  scores,
  snapshots,
  bpm,
  den,
  tonicPc,
  scaleName,
}: {
  scores: TakeScore[];
  snapshots: TakeSnap[];
  bpm: number;
  den: number;
  tonicPc: number;
  scaleName: string | SolfegeScaleName;
}) {
  const n = Math.max(1, scores.length);
  const avg = (sel: (s: TakeScore) => number, dp = 1) =>
    Math.round((scores.reduce((a, s) => a + sel(s), 0) / n) * Math.pow(10, dp)) / Math.pow(10, dp);

  const finalPct = avg((s) => s.final.percent);
  const finalLetter = letterFromPercent(finalPct);

  // top-level stats
  const pitchPct = avg((s) => s.pitch.percent);
  const timeOnPitchPct = Math.round((scores.reduce((a, s) => a + s.pitch.timeOnPitchRatio, 0) / n) * 100);
  const pitchMae = Math.round(scores.reduce((a, s) => a + s.pitch.centsMae, 0) / n);

  const melPct = avg((s) => s.rhythm.melodyPercent);
  const melHit = Math.round((scores.reduce((a, s) => a + s.rhythm.melodyHitRate, 0) / n) * 100);
  const melMeanAbs = Math.round(scores.reduce((a, s) => a + s.rhythm.melodyMeanAbsMs, 0) / n);

  const intervalsPct = avg((s) => clamp01(s.intervals.correctRatio) * 100);

  /* ─────────── dashboard state ─────────── */
  const [view, setView] = React.useState<ViewKey>("performance");
  const [introEpoch, setIntroEpoch] = React.useState(0);
  React.useEffect(() => { setIntroEpoch((e) => e + 1); }, [view]);

  const rightCardTitle: Record<ViewKey, { title: string; subtitle: string }> = {
    performance: { title: "Performance over takes", subtitle: "Final score trend" },
    "pitch-acc": { title: "Pitch accuracy", subtitle: "On-pitch% per note" },
    "pitch-prec": { title: "Pitch precision", subtitle: "MAE (¢) per note" },
    melody: { title: "Melody coverage", subtitle: "By duration per take" },
    intervals: { title: "Intervals", subtitle: "Class accuracy per take" },
  };

  return (
    <div className="w-full h-full px-3 sm:px-4 md:px-6 flex flex-col gap-3 min-h-0">
      {/* Header */}
      <Header title="Lesson report" finalPct={finalPct} finalLetter={finalLetter} />

      {/* Stat chips */}
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
      />

      {/* Two-column layout from md up: fixed picker rail + capped chart height */}
      <div
        className="grid gap-3 grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr] items-start flex-1 min-h-0"
        style={{ ["--ana-rail-h" as any]: "calc(5*clamp(52px,3vw,84px) + 4*0.5rem)" } as React.CSSProperties}
      >
        {/* Left rail: vertical picker */}
        <div className="min-h-0">
          <NavCards active={view} setActive={setView} />
        </div>

        {/* Right: chart card — height capped to rail height from md↑ */}
        <div className="min-h-0 flex">
          <div className="rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-4 md:p-6 shadow-sm w-full min-h-0 overflow-hidden self-start md:h-[var(--ana-rail-h)]">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h3 className="text-lg md:text-xl font-semibold text-[#0f0f0f]">{rightCardTitle[view].title}</h3>
              <div className="text-xs md:text-sm text-[#373737]">{rightCardTitle[view].subtitle}</div>
            </div>

            <div className="h-[calc(100%-1.75rem)] min-h-0">
              {view === "performance" && (
                <PerformanceOverTakesChart scores={scores} introEpoch={introEpoch} />
              )}
              {view === "pitch-acc" && (
                <PitchAccuracyChart
                  scores={scores}
                  snapshots={snapshots}
                  tonicPc={tonicPc}
                  scaleName={scaleName}
                  introEpoch={introEpoch}
                />
              )}
              {view === "pitch-prec" && (
                <PitchPrecisionChart
                  scores={scores}
                  snapshots={snapshots}
                  tonicPc={tonicPc}
                  scaleName={scaleName}
                  introEpoch={introEpoch}
                />
              )}
              {view === "melody" && (
                <MelodyCoverageChart
                  scores={scores}
                  snapshots={snapshots}
                  bpm={bpm}
                  den={den}
                  introEpoch={introEpoch}
                />
              )}
              {view === "intervals" && (
                <IntervalsChart scores={scores} introEpoch={introEpoch} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
