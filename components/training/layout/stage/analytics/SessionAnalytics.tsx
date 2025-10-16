// components/training/layout/stage/analytics/SessionAnalytics.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { letterFromPercent } from "@/utils/scoring/grade";

import PerformanceOverTakes from "./PerformanceOverTakes";
import MultiSeriesLines, { type Series } from "./MultiSeriesLines";

import { midiLabelForKey } from "@/utils/pitch/enharmonics";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";
import { secondsToNoteName, intervalLabel } from "../side-panel/SidePanelScores/format";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type TakeSnap = { phrase: Phrase; rhythm: RhythmEvent[] | null };
type ViewKey = "performance" | "pitch-acc" | "pitch-prec" | "melody" | "intervals";

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

  /* ───────────────── pitch per-note (per take) → two multi-series */
  const PITCH_MAX_CENTS = 120;

  const { pitchAccuracySeries, pitchPrecisionSeries } = React.useMemo(() => {
    const nT = scores.length;
    type Acc = { sumRatio: number; sumMae: number; count: number };

    const order = new Map<string, number>(); let ordCounter = 0;
    const accMaps: Array<Map<string, Acc>> = Array.from({ length: nT }, () => new Map());

    for (let t = 0; t < nT; t++) {
      const s = scores[t]!;
      const snap = snapshots[t];
      const per = s.pitch.perNote ?? [];
      const notes = snap?.phrase?.notes ?? [];

      for (let j = 0; j < notes.length; j++) {
        const stat = per[j]; if (!stat) continue;
        const midi = Math.round(notes[j]!.midi);
        const label = midiLabelForKey(midi, tonicPc, scaleName as SolfegeScaleName).text;

        if (!order.has(label)) order.set(label, ordCounter++);
        const bucket = accMaps[t]!.get(label) ?? { sumRatio: 0, sumMae: 0, count: 0 };
        bucket.sumRatio += clamp01(stat.ratio);
        bucket.sumMae += Math.max(0, stat.centsMae);
        bucket.count += 1;
        accMaps[t]!.set(label, bucket);
      }
    }

    const labels = Array.from(order.entries()).sort((a, b) => a[1] - b[1]).map(([k]) => k);

    const accSeries: Series[] = [];
    const maeSeries: Series[] = [];
    for (const label of labels) {
      const accVals = Array.from({ length: nT }, () => null as number | null);
      const maeVals = Array.from({ length: nT }, () => null as number | null);
      for (let t = 0; t < nT; t++) {
        const g = accMaps[t]!.get(label);
        if (!g || g.count === 0) continue;
        accVals[t] = (g.sumRatio / g.count) * 100;                  // %
        maeVals[t] = Math.min(PITCH_MAX_CENTS, g.sumMae / g.count); // ¢
      }
      accSeries.push({ label, values: accVals });
      maeSeries.push({ label, values: maeVals });
    }

    const MAX_SERIES = 8;
    return {
      pitchAccuracySeries: accSeries.slice(0, MAX_SERIES),
      pitchPrecisionSeries: maeSeries.slice(0, MAX_SERIES),
    };
  }, [scores, snapshots, tonicPc, scaleName]);

  /* ───────── melody coverage per duration — series per label, dots per take */
  const melodySeries: Series[] = React.useMemo(() => {
    const nT = scores.length;
    const acc = new Map<string, Array<number | null>>();
    const order = new Map<string, number>(); let o = 0;

    for (let i = 0; i < nT; i++) {
      const s = scores[i]!;
      const snap = snapshots[i];
      const per = s.rhythm.perNoteMelody ?? [];
      const notes = snap?.phrase?.notes ?? [];

      const perLabel = new Map<string, { sum: number; count: number }>();
      for (let j = 0; j < notes.length; j++) {
        const r = per[j];
        if (!r || typeof r.coverage !== "number") continue;
        const label = secondsToNoteName(notes[j]!.durSec, bpm, den);
        if (!order.has(label)) order.set(label, o++);
        const g = perLabel.get(label) ?? { sum: 0, count: 0 };
        g.sum += r.coverage * 100;
        g.count += 1;
        perLabel.set(label, g);
      }
      for (const [label, g] of perLabel) {
        if (!acc.has(label)) acc.set(label, Array.from({ length: nT }, () => null));
        acc.get(label)![i] = g.count ? g.sum / g.count : null;
      }
    }

    const all = Array.from(acc.entries()).map(([label, values]) => ({ label, values, ord: order.get(label) ?? 1e9 }))
      .sort((a, b) => a.ord - b.ord);

    const preferred = ["Quarter", "Eighth", "Dotted eighth", "Sixteenth"];
    all.sort((a, b) => {
      const ai = preferred.indexOf(a.label);
      const bi = preferred.indexOf(b.label);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.ord - b.ord;
    });

    const MAX_SERIES = 6;
    return all.slice(0, MAX_SERIES).map(({ label, values }) => ({ label, values }));
  }, [scores, snapshots, bpm, den]);

  /* ───────── intervals per class — only include attempted classes */
  const intervalSeries: Series[] = React.useMemo(() => {
    const wantedBase = [0, 12, 1, 4]; // Unison, Octave, m2, M3
    const nT = scores.length;

    const attempted = new Set<number>();
    for (let i = 0; i < nT; i++) {
      const classes = scores[i]?.intervals?.classes ?? [];
      for (const c of classes) {
        if (wantedBase.includes(c.semitones) && (c.attempts ?? 0) > 0) attempted.add(c.semitones);
      }
    }
    const wanted = wantedBase.filter((semi) => attempted.has(semi));
    if (wanted.length === 0) return [];

    const lines = wanted.map((semi) => ({
      semitones: semi,
      label: intervalLabel(semi),
      values: Array.from({ length: nT }, () => null as number | null),
    }));

    for (let i = 0; i < nT; i++) {
      const classes = scores[i]?.intervals?.classes ?? [];
      for (const line of lines) {
        const row = classes.find((c) => c.semitones === line.semitones);
        if (!row) continue;
        const pct = (row.attempts ?? 0) > 0 ? (100 * (row.correct ?? 0)) / (row.attempts ?? 1) : null;
        line.values[i] = pct;
      }
    }

    return lines
      .filter(({ values }) => values.some((v) => v != null))
      .map(({ label, values }) => ({ label, values }));
  }, [scores]);

  /* ─────────── single-chart dashboard state ─────────── */
  const [view, setView] = React.useState<ViewKey>("performance");

  // Epoch signal to restart intro animations without remounting
  const [introEpoch, setIntroEpoch] = React.useState(0);
  React.useEffect(() => {
    setIntroEpoch((e) => e + 1);
  }, [view]);

  const viewMeta: Record<
    ViewKey,
    { title: string; subtitle: string; render: () => React.ReactNode; hasData: boolean }
  > = {
    performance: {
      title: "Performance over takes",
      subtitle: "Final score trend",
      render: () => (
        <PerformanceOverTakes
          scores={scores}
          height="100%"
          reserveTopGutter={false}
          reserveLegendRow={false}
          legendRowHeight={22}
          introEpoch={introEpoch}
        />
      ),
      hasData: scores.length > 0,
    },
    "pitch-acc": {
      title: "Pitch accuracy",
      subtitle: "On-pitch% per note",
      render: () => (
        <MultiSeriesLines
          title="Pitch accuracy • on-pitch% (per note, per take)"
          series={pitchAccuracySeries}
          height="100%"
          yMin={0}
          yMax={100}
          ySuffix="%"
          reserveTopGutter={false}
          legendRowHeight={22}
          introEpoch={introEpoch}
        />
      ),
      hasData: pitchAccuracySeries.some((s) => s.values.some((v) => v != null)),
    },
    "pitch-prec": {
      title: "Pitch precision",
      subtitle: "MAE (¢) per note",
      render: () => (
        <MultiSeriesLines
          title="Pitch precision • MAE (¢) (per note, per take)"
          series={pitchPrecisionSeries}
          height="100%"
          yMin={0}
          yMax={PITCH_MAX_CENTS}
          ySuffix="¢"
          invertY
          reserveTopGutter={false}
          legendRowHeight={22}
          introEpoch={introEpoch}
        />
      ),
      hasData: pitchPrecisionSeries.some((s) => s.values.some((v) => v != null)),
    },
    melody: {
      title: "Melody coverage",
      subtitle: "By duration per take",
      render: () => (
        <MultiSeriesLines
          title="Melody coverage • by duration (per take)"
          series={melodySeries}
          height="100%"
          yMin={0}
          yMax={100}
          ySuffix="%"
          reserveTopGutter={false}
          legendRowHeight={22}
          introEpoch={introEpoch}
        />
      ),
      hasData: melodySeries.some((s) => s.values.some((v) => v != null)),
    },
    intervals: {
      title: "Intervals",
      subtitle: "Class accuracy per take",
      render: () => (
        <MultiSeriesLines
          title="Intervals • by class (per take)"
          series={intervalSeries}
          height="100%"
          yMin={0}
          yMax={100}
          ySuffix="%"
          reserveTopGutter={false}
          legendRowHeight={22}
          introEpoch={introEpoch}
        />
      ),
      hasData: intervalSeries.some((s) => s.values.some((v) => v != null)),
    },
  };

  return (
    <div className="w-full h-full px-3 sm:px-4 md:px-6 flex flex-col gap-3 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-base md:text-lg font-semibold">Lesson report</div>
        <div className="inline-flex items-center rounded-full border border-[#dcdcdc] px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
          <span>{finalPct.toFixed(1)}%</span>
          <span className="mx-1 opacity-50">•</span>
          <span>{finalLetter}</span>
        </div>
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard title={`Final (${finalLetter})`} main={`${finalPct.toFixed(1)}%`} />
        <StatCard title="Pitch" main={`${pitchPct.toFixed(1)}%`} sub={`On-pitch ${timeOnPitchPct}% • MAE ${pitchMae}¢`} />
        <StatCard title="Melody rhythm" main={`${melPct.toFixed(1)}%`} sub={`Hit ${melHit}% • μ|Δt| ${melMeanAbs}ms`} />
        <StatCard title="Intervals" main={`${avg((s) => s.intervals.correctRatio * 100).toFixed(1)}%`} sub="Per-take breakdown below" />
      </div>

      {/* Two-column layout from md up: fixed picker rail + capped chart height */}
      <div
        className="grid gap-3 grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr] items-start flex-1 min-h-0"
        style={
          {
            ["--ana-rail-h" as any]: "calc(5*clamp(52px,3vw,84px) + 4*0.5rem)",
          } as React.CSSProperties
        }
      >
        {/* Left rail: vertical picker */}
        <div className="min-h-0">
          <div className="flex flex-col gap-2 min-h-0">
            <PickerButton
              active={view === "performance"}
              title={viewMeta["performance"].title}
              subtitle={viewMeta["performance"].subtitle}
              onClick={() => setView("performance")}
            />
            <PickerButton
              active={view === "pitch-acc"}
              title={viewMeta["pitch-acc"].title}
              subtitle={viewMeta["pitch-acc"].subtitle}
              onClick={() => setView("pitch-acc")}
            />
            <PickerButton
              active={view === "pitch-prec"}
              title={viewMeta["pitch-prec"].title}
              subtitle={viewMeta["pitch-prec"].subtitle}
              onClick={() => setView("pitch-prec")}
            />
            <PickerButton
              active={view === "melody"}
              title={viewMeta["melody"].title}
              subtitle={viewMeta["melody"].subtitle}
              onClick={() => setView("melody")}
            />
            <PickerButton
              active={view === "intervals"}
              title={viewMeta["intervals"].title}
              subtitle={viewMeta["intervals"].subtitle}
              onClick={() => setView("intervals")}
            />
          </div>
        </div>

        {/* Right: chart card — height capped to rail height from md↑ */}
        <div className="min-h-0 flex">
          <div className="rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-4 md:p-6 shadow-sm w-full min-h-0 overflow-hidden self-start md:h-[var(--ana-rail-h)]">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h3 className="text-lg md:text-xl font-semibold text-[#0f0f0f]">{viewMeta[view].title}</h3>
              <div className="text-xs md:text-sm text-[#373737]">{viewMeta[view].subtitle}</div>
            </div>

            <div className="h-[calc(100%-1.75rem)] min-h-0">
              {viewMeta[view].hasData ? (
                viewMeta[view].render()
              ) : (
                <div className="w-full h-full grid place-items-center rounded-xl bg-[#f5f5f5] text-sm text-[#0f0f0f]">
                  No data for this view yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── picker button (fluid text on small screens) ─────────── */
function PickerButton({
  title,
  subtitle,
  onClick,
  active,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={title}
      className={[
        // base
        "group text-left rounded-2xl border bg-gradient-to-b w-full",
        // responsive height: 52px → 84px depending on viewport width
        "h-[clamp(52px,3vw,84px)] px-2.5 sm:px-3 md:px-4",
        "flex items-center justify-between gap-3 transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
        // variants
        active
          ? "from-[#fafafa] to-[#f3f3f3] border-[#e6e6e6] shadow-md"
          : "from-[#f2f2f2] to-[#eeeeee] border-[#d2d2d2] shadow-sm hover:shadow-md",
      ].join(" ")}
    >
      <div className="min-w-0">
        {/* Title: fluid 12px → 18px, tight leading to avoid spill */}
        <div
          className="font-semibold text-[#0f0f0f] truncate leading-tight tracking-tight"
          style={{ fontSize: "clamp(12px, 1vw, 18px)" }}
        >
          {title}
        </div>
        {subtitle ? (
          // Subtitle: fluid 10px → 14px, snug leading
          <div
            className="text-[#373737] mt-0.5 truncate leading-snug"
            style={{ fontSize: "clamp(10px, .5vw, 14px)" }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      <div
        className={[
          "shrink-0 rounded-full shadow-sm bg-[#f4f4f4] border border-[#e6e6e6]",
          "w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 grid place-items-center",
          active ? "text-[#0f0f0f]" : "text-[#0f0f0f]/70 group-hover:text-[#0f0f0f]",
          "transition",
        ].join(" ")}
        aria-hidden
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="-mr-0.5">
          <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  );
}

/* ─────────── stat card (unchanged) ─────────── */
function StatCard({ title, main, sub }: { title: string; main: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[#dcdcdc] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-4 shadow-sm">
      <div className="text-sm font-semibold text-[#0f0f0f]">{title}</div>
      <div className="text-2xl md:text-3xl font-semibold tracking-tight text-[#0f0f0f] mt-1">{main}</div>
      {sub ? <div className="text-xs text-[#6b6b6b] mt-1">{sub}</div> : null}
    </div>
  );
}
