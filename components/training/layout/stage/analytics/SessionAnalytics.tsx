// components/training/layout/stage/analytics/SessionAnalytics.tsx
"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { letterFromPercent } from "@/utils/scoring/grade";
import PerformanceOverTakes from "./PerformanceOverTakes";

import { midiLabelForKey } from "@/utils/pitch/enharmonics";
import { pcToSolfege, type SolfegeScaleName } from "@/utils/lyrics/solfege";
import { secondsToNoteName } from "../side-panel/SidePanelScores/format";
import { noteValueToSeconds } from "@/utils/time/tempo";

const PolarArea: any = dynamic(
  () => import("@/components/home/statsbento/pitch/PolarArea").then((m) => (m.default as any)),
  { ssr: false, loading: () => null }
);

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

  // ── Top-level stats
  const pitchPct = avg((s) => s.pitch.percent);
  const timeOnPitchPct = Math.round((scores.reduce((a, s) => a + s.pitch.timeOnPitchRatio, 0) / n) * 100);
  const pitchMae = Math.round(scores.reduce((a, s) => a + s.pitch.centsMae, 0) / n);

  const melPct = avg((s) => s.rhythm.melodyPercent);
  const melHit = Math.round((scores.reduce((a, s) => a + s.rhythm.melodyHitRate, 0) / n) * 100);
  const melMeanAbs = Math.round(scores.reduce((a, s) => a + s.rhythm.melodyMeanAbsMs, 0) / n);

  const lineSamples = scores.filter((s) => s.rhythm.lineEvaluated);
  const haveLine = lineSamples.length > 0;
  const lineN = Math.max(1, lineSamples.length);
  const linePct = haveLine ? Math.round((lineSamples.reduce((a, s) => a + s.rhythm.linePercent, 0) / lineN) * 10) / 10 : 0;
  const lineHit = haveLine ? Math.round((lineSamples.reduce((a, s) => a + s.rhythm.lineHitRate, 0) / lineN) * 100) : 0;
  const lineMeanAbs = haveLine ? Math.round(lineSamples.reduce((a, s) => a + s.rhythm.lineMeanAbsMs, 0) / lineN) : 0;

  const intervalsPct = Math.round((scores.reduce((a, s) => a + s.intervals.correctRatio * 100, 0) / n) * 10) / 10;
  const intervalsCorrect = scores.reduce((a, s) => a + (s.intervals.correct || 0), 0);
  const intervalsTotal = scores.reduce((a, s) => a + (s.intervals.total || 0), 0);

  // ───────────────────────────────── aggregates (for detail polars)
  // Intervals by class (0..12 semitones)
  const byClass = React.useMemo(() => {
    const m = new Map<number, { attempts: number; correct: number }>();
    for (let i = 0; i <= 12; i++) m.set(i, { attempts: 0, correct: 0 });
    for (const s of scores) {
      for (const c of s.intervals.classes ?? []) {
        const cell = m.get(c.semitones)!;
        cell.attempts += c.attempts || 0;
        cell.correct += c.correct || 0;
      }
    }
    return m;
  }, [scores]);

  // Pitch per note (group same note names across takes)
  const aggPitchRows = React.useMemo(() => {
    type Acc = { key: string; label: string; solf: string; order: number; n: number; meanRatio: number; meanMae: number };
    const m = new Map<string, Acc>();
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]!;
      const snap = snapshots[i];
      const per = s.pitch.perNote;
      const notes = snap?.phrase?.notes ?? [];
      for (let j = 0; j < notes.length; j++) {
        const p = per?.[j];
        if (!p) continue;
        const midi = Math.round(notes[j]!.midi);
        const pcAbs = ((midi % 12) + 12) % 12;
        const labelTxt = midiLabelForKey(midi, tonicPc, scaleName as SolfegeScaleName).text;
        const solf = pcToSolfege(pcAbs, tonicPc, scaleName as SolfegeScaleName, { caseStyle: "lower" });
        const key = `${labelTxt}|${solf}`;
        if (!m.has(key)) m.set(key, { key, label: labelTxt, solf, order: j, n: 0, meanRatio: 0, meanMae: 0 });
        const g = m.get(key)!;
        g.n += 1;
        g.meanRatio += (p.ratio - g.meanRatio) / g.n;
        g.meanMae += (p.centsMae - g.meanMae) / g.n;
      }
    }
    return Array.from(m.values()).sort((a, b) => a.order - b.order);
  }, [scores, snapshots, tonicPc, scaleName]);

  // Melody rhythm by duration (coverage %)
  const aggMelodyRows = React.useMemo(() => {
    type Acc = { label: string; order: number; n: number; meanCoverage: number };
    const m = new Map<string, Acc>();
    let ord = 0;
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]!;
      const snap = snapshots[i];
      const per = s.rhythm.perNoteMelody;
      const notes = snap?.phrase?.notes ?? [];
      for (let j = 0; j < notes.length; j++) {
        const r = per?.[j];
        if (!r) continue;
        const label = secondsToNoteName(notes[j]!.durSec, bpm, den);
        if (!m.has(label)) m.set(label, { label, order: ord++, n: 0, meanCoverage: 0 });
        const g = m.get(label)!;
        g.n += 1;
        g.meanCoverage += (r.coverage - g.meanCoverage) / g.n;
      }
    }
    return Array.from(m.values()).sort((a, b) => a.order - b.order);
  }, [scores, snapshots, bpm, den]);

  // Rhythm line by duration (hit %)
  const aggLineRows = React.useMemo(() => {
    type Acc = { label: string; order: number; n: number; meanHit: number };
    const m = new Map<string, Acc>();
    let ord = 0;
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]!; if (!s.rhythm.lineEvaluated) continue;
      const snap = snapshots[i];
      const events = snap?.rhythm ?? [];
      const rows = s.rhythm.linePerEvent ?? [];
      for (const r of rows) {
        const ev = events?.[r.idx]; if (!ev) continue;
        const durSec = noteValueToSeconds(ev.value, bpm, den);
        const label = secondsToNoteName(durSec, bpm, den);
        if (!m.has(label)) m.set(label, { label, order: ord++, n: 0, meanHit: 0 });
        const g = m.get(label)!;
        g.n += 1;
        g.meanHit += (((r.credit ?? 0) > 0 ? 1 : 0) - g.meanHit) / g.n;
      }
    }
    return Array.from(m.values()).sort((a, b) => a.order - b.order);
  }, [scores, snapshots, bpm, den]);

  // ───────────────────────────────── polar datasets (DETAIL ONLY)
  // Pitch review: note-by-note On-pitch % + MAE (¢)
  const PITCH_MAX_CENTS = 120; // cap for MAE ring
  const polarPitchNotes: any[] = aggPitchRows.map((g) => ({
    label: `${g.label}`,
    v1: Math.max(0, Math.min(100, g.meanRatio * 100)), // accuracy %
    v2: Math.max(0, Math.min(PITCH_MAX_CENTS, g.meanMae)), // raw MAE in cents (bigger = worse)
  }));

  // Melody rhythm: grouped duration vs Coverage %
  const polarMelodyDurations: any[] = aggMelodyRows.map((r) => ({
    label: r.label,
    v1: Math.max(0, Math.min(100, r.meanCoverage * 100)),
    v2: 100,
  }));

  // Intervals: Unison, Octave, m2, M3 only (% correct)
  const wantedIntervals = [
    { semitones: 0, label: "Unison" },
    { semitones: 12, label: "Octave" },
    { semitones: 1, label: "m2" },
    { semitones: 4, label: "M3" },
  ];
  const polarIntervalsWanted: any[] = wantedIntervals.map(({ semitones, label }) => {
    const cell = byClass.get(semitones) ?? { attempts: 0, correct: 0 };
    const pct = cell.attempts ? Math.round((100 * cell.correct) / cell.attempts) : 0;
    return { label, v1: pct, v2: 100 };
  });

  // Rhythm line: grouped duration vs Hit %
  const polarLineDurations: any[] = haveLine
    ? aggLineRows.map((r) => ({ label: r.label, v1: Math.max(0, Math.min(100, r.meanHit * 100)), v2: 100 }))
    : [];

  // Responsive columns for detail row (single row; wraps on small screens)
  const detailColsClass = haveLine
    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-base md:text-lg font-semibold">Session analytics</div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#f8f8f8] px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
            {finalPct.toFixed(1)}%
          </span>
          <span className="text-xs text-[#373737]">({finalLetter})</span>
        </div>
      </div>

      {/* ROW 1: four stat cards (full width) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard title={`Final • ${finalLetter}`} main={`${finalPct.toFixed(1)}%`} />
        <StatCard title="Pitch" main={`${pitchPct.toFixed(1)}%`} sub={`On-pitch ${timeOnPitchPct}% • MAE ${pitchMae}¢`} />
        <StatCard title="Melody rhythm" main={`${melPct.toFixed(1)}%`} sub={`Hit ${melHit}% • μ|Δt| ${melMeanAbs}ms`} />
        <StatCard title="Intervals" main={`${intervalsPct.toFixed(1)}%`} sub={`${intervalsCorrect}/${intervalsTotal} correct`} />
      </div>

      {/* ROW 2: performance over takes (full width, compact) */}
      <PerformanceOverTakes scores={scores} />

      {/* ROW 3: single full-width row of detail polars */}
      <div className={`grid ${detailColsClass} gap-3 `}>
        <div className="rounded-xl border border-[#dcdcdc] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Pitch review (per note)</div>
          <PolarArea items={polarPitchNotes} max1={100} max2={PITCH_MAX_CENTS} height={180} />
        </div>

        <div className="rounded-xl border border-[#dcdcdc] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Melody rhythm (coverage)</div>
          <PolarArea items={polarMelodyDurations} max1={100} max2={100} height={180} />
        </div>

        <div className="rounded-xl border border-[#dcdcdc] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] shadow-sm p-3">
          <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Intervals (key set)</div>
          <PolarArea items={polarIntervalsWanted} max1={100} max2={100} height={180} />
        </div>

        {haveLine ? (
          <div className="rounded-xl border border-[#dcdcdc] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] shadow-sm p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Rhythm line (hit %)</div>
            <PolarArea items={polarLineDurations} max1={100} max2={100} height={180} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ──────────── tiny local bits ──────────── */
function StatCard({ title, main, sub }: { title: string; main: string; sub?: string }) {
  return (
    <div className="rounded-xl shadow-sm border border-[#dcdcdc] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{title}</div>
      <div className="text-sm md:text-base font-semibold text-[#0f0f0f]">{main}</div>
      {sub ? <div className="text-xs text-[#373737] mt-0.5">{sub}</div> : null}
    </div>
  );
}
