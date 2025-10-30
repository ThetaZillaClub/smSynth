// components/training/layout/stage/side-panel/SidePanelScores/OverallReview.tsx
"use client";

import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { letterFromPercent } from "@/utils/scoring/grade";
import { intervalLabel, secondsToNoteName } from "./format";
import { midiLabelForKey } from "@/utils/pitch/enharmonics";
import { pcToSolfege, type SolfegeScaleName } from "@/utils/lyrics/solfege";
import { finalizeVisible } from "@/utils/scoring/final/finalize";

type TakeSnap = { phrase: Phrase; rhythm: RhythmEvent[] | null };

type View = "summary" | "pitch" | "melody" | "line" | "intervals";

export default function OverallReview({
  scores,
  snapshots = [],
  bpm,
  den,
  tonicPc = 0,
  scaleName = "major",
  onClose,
  visibility = {
    showPitch: true,
    showIntervals: true,
    showMelodyRhythm: true,
    showRhythmLine: true,
  },
}: {
  scores: TakeScore[];
  snapshots?: TakeSnap[];
  bpm: number;
  den: number;
  tonicPc?: number;
  scaleName?: SolfegeScaleName;
  onClose?: () => void;
  visibility?: {
    showPitch: boolean;
    showIntervals: boolean;
    showMelodyRhythm: boolean;
    showRhythmLine: boolean;
  };
}) {
  const n = scores.length || 1;
  const avg = (sel: (s: TakeScore) => number) =>
    Math.round((scores.reduce((a, s) => a + sel(s), 0) / n) * 10) / 10;

  // VISIBILITY-AWARE final percent/letter
  const finalPct = React.useMemo(() => {
    if (!scores.length) return NaN;
    const sum = scores.reduce(
      (a, s) => a + finalizeVisible(s, visibility).percent,
      0
    );
    return Math.round(((sum / scores.length) * 10)) / 10;
  }, [scores, visibility]);

  const finalLetter = Number.isFinite(finalPct) ? letterFromPercent(finalPct) : "—";

  // Other aggregates
  const pitchPct = avg((s) => s.pitch.percent);
  const timeOnPitchPct = Math.round(
    (scores.reduce((a, s) => a + s.pitch.timeOnPitchRatio, 0) / n) * 100
  );
  const pitchMae = Math.round(
    scores.reduce((a, s) => a + s.pitch.centsMae, 0) / n
  );

  const melPct = avg((s) => s.rhythm.melodyPercent);
  const melHit = Math.round(
    (scores.reduce((a, s) => a + s.rhythm.melodyHitRate, 0) / n) * 100
  );
  const melMeanAbs = Math.round(
    scores.reduce((a, s) => a + s.rhythm.melodyMeanAbsMs, 0) / n
  );

  const lineSamples = scores.filter((s) => s.rhythm.lineEvaluated);
  const haveLine = lineSamples.length > 0;
  const lineN = lineSamples.length || 1;
  const linePct = haveLine
    ? Math.round(
        (lineSamples.reduce((a, s) => a + s.rhythm.linePercent, 0) / lineN) * 10
      ) / 10
    : 0;
  const lineHit = haveLine
    ? Math.round(
        (lineSamples.reduce((a, s) => a + s.rhythm.lineHitRate, 0) / lineN) * 100
      )
    : 0;
  const lineMeanAbs = haveLine
    ? Math.round(
        lineSamples.reduce((a, s) => a + s.rhythm.lineMeanAbsMs, 0) / lineN
      )
    : 0;

  const intervalsPct =
    Math.round(
      (scores.reduce((a, s) => a + s.intervals.correctRatio * 100, 0) / n) * 10
    ) / 10;

  const [view, setView] = React.useState<View>("summary");

  // ───────────────────── Aggregations ─────────────────────
  type AccIC = { attempts: number; correct: number };
  const intervalByClass = React.useMemo(() => {
    const byClass = new Map<number, AccIC>();
    for (let i = 0; i <= 12; i++) byClass.set(i, { attempts: 0, correct: 0 });
    for (const s of scores) {
      for (const c of s.intervals.classes ?? []) {
        const cell = byClass.get(c.semitones)!;
        cell.attempts += c.attempts || 0;
        cell.correct += c.correct || 0;
      }
    }
    return Array.from(byClass.entries())
      .map(([semitones, v]) => ({
        semitones,
        label: intervalLabel(semitones),
        attempts: v.attempts,
        correct: v.correct,
        percent: v.attempts ? Math.round((100 * v.correct) / v.attempts) : 0,
      }))
      .filter((r) => r.attempts > 0);
  }, [scores]);

  const aggPitchRows = React.useMemo(() => {
    type Acc = {
      key: string;
      label: string;
      solf: string;
      order: number;
      n: number;
      meanRatio: number;
      meanMae: number;
    };
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
        const label = midiLabelForKey(midi, tonicPc, scaleName).text;
        const solf = pcToSolfege(pcAbs, tonicPc, scaleName, { caseStyle: "lower" });
        const key = `${label}|${solf}`;
        if (!m.has(key))
          m.set(key, { key, label, solf, order: j, n: 0, meanRatio: 0, meanMae: 0 });
        const g = m.get(key)!;
        g.n += 1;
        g.meanRatio += (p.ratio - g.meanRatio) / g.n;
        g.meanMae += (p.centsMae - g.meanMae) / g.n;
      }
    }
    return Array.from(m.values()).sort((a, b) => a.order - b.order);
  }, [scores, snapshots, tonicPc, scaleName]);

  const aggMelodyRows = React.useMemo(() => {
    type Acc = {
      label: string;
      order: number;
      n: number;
      meanCoverage: number;
      meanAbsOnset: number;
    };
    const m = new Map<string, Acc>();
    let orderCounter = 0;
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]!;
      const snap = snapshots[i];
      const per = s.rhythm.perNoteMelody;
      const notes = snap?.phrase?.notes ?? [];
      for (let j = 0; j < notes.length; j++) {
        const r = per?.[j];
        if (!r) continue;
        const label = secondsToNoteName(notes[j]!.durSec, bpm, den);
        if (!m.has(label))
          m.set(label, { label, order: orderCounter++, n: 0, meanCoverage: 0, meanAbsOnset: 0 });
        const g = m.get(label)!;
        g.n += 1;
        g.meanCoverage += (r.coverage - g.meanCoverage) / g.n;
        if (Number.isFinite(r.onsetErrMs)) {
          const abs = Math.abs(r.onsetErrMs!);
          g.meanAbsOnset += (abs - g.meanAbsOnset) / g.n;
        }
      }
    }
    return Array.from(m.values()).sort((a, b) => a.order - b.order);
  }, [scores, snapshots, bpm, den]);

  // NEW: Beat-only aggregation for rhythm line (IOI between expected beats)
  const aggLineRows = React.useMemo(() => {
    type Acc = { label: string; order: number; n: number; meanHit: number; meanAbsErr: number };
    const m = new Map<string, Acc>();
    let orderCounter = 0;

    const beatSec = 60 / Math.max(1, bpm);
    const labelName = den === 4 ? "Quarter" : "Beat";
    const labelFor = (sec: number) => {
      if (!Number.isFinite(sec) || sec <= 0) return undefined;
      const ratio = sec / beatSec;
      return Math.abs(ratio - 1) <= 0.25 ? labelName : undefined; // ±25%
    };

    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]!;
      if (!s.rhythm.lineEvaluated) continue;

      const rows = s.rhythm.linePerEvent ?? [];
      for (let j = 0; j < rows.length - 1; j++) {
        const a = rows[j]!;
        const b = rows[j + 1]!;
        const durSec = Math.max(0, (b.expSec ?? 0) - (a.expSec ?? 0));
        const label = labelFor(durSec);
        if (!label) continue;

        if (!m.has(label))
          m.set(label, { label, order: orderCounter++, n: 0, meanHit: 0, meanAbsErr: 0 });
        const g = m.get(label)!;
        g.n += 1;

        const hit = (a.credit ?? 0) > 0 ? 1 : 0;
        g.meanHit += (hit - g.meanHit) / g.n;

        if (Number.isFinite(a.errMs)) {
          const abs = Math.abs(a.errMs!);
          g.meanAbsErr += (abs - g.meanAbsErr) / g.n;
        }
      }
    }

    return Array.from(m.values()).sort((a, b) => a.order - b.order);
  }, [scores, bpm, den]);

  React.useEffect(() => {
    if (view === "melody" && !visibility.showMelodyRhythm) setView("summary");
    if (view === "line" && !visibility.showRhythmLine) setView("summary");
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
          Overall session
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

      {view === "summary" ? (
        <div className="grid grid-cols-1 gap-2">
          <StaticRow
            label={`Final • ${finalLetter}`}
            value={Number.isFinite(finalPct) ? `${finalPct.toFixed(1)}%` : "—"}
          />

          <ClickableRow
            label="Pitch accuracy"
            value={`${pitchPct.toFixed(1)}%`}
            detail={`On pitch ${timeOnPitchPct}% • MAE ${pitchMae}¢`}
            onClick={() => setView("pitch")}
          />

          {visibility.showMelodyRhythm && (
            <ClickableRow
              label="Rhythm (melody)"
              value={`${melPct.toFixed(1)}%`}
              detail={`Hit ${melHit}% • μ|Δt| ${melMeanAbs}ms`}
              onClick={() => setView("melody")}
            />
          )}

          {visibility.showIntervals && (
            <ClickableRow
              label="Intervals"
              value={`${intervalsPct.toFixed(1)}%`}
              detail="Open aggregated breakdown"
              onClick={() => setView("intervals")}
            />
          )}

          {visibility.showRhythmLine && haveLine ? (
            <ClickableRow
              label="Rhythm (blue line)"
              value={`${linePct.toFixed(1)}%`}
              detail={`Hit ${lineHit}% • μ|Δt| ${lineMeanAbs}ms`}
              onClick={() => setView("line")}
            />
          ) : null}
        </div>
      ) : view === "intervals" ? (
        <div className="flex flex-col gap-2">
          <SubHeader
            title="Intervals — aggregated across all takes"
            main={`${intervalsPct.toFixed(1)}%`}
          />
          <div
            className={[
              "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
              "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
            ].join(" ")}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#6b6b6b]">
                  <th className="px-2 py-2">Interval</th>
                  <th className="px-2 py-2">Attempts</th>
                  <th className="px-2 py-2">Correct</th>
                  <th className="px-2 py-2">% Correct</th>
                </tr>
              </thead>
              <tbody>
                {intervalByClass.length === 0 ? (
                  <tr className="border-t border-[#eee]">
                    <td className="px-2 py-1.5" colSpan={4}>
                      No interval attempts yet.
                    </td>
                  </tr>
                ) : (
                  intervalByClass.map((r) => (
                    <tr key={r.semitones} className="border-t border-[#eee]">
                      <td className="px-2 py-1.5 align-middle font-medium">
                        {r.label}
                      </td>
                      <td className="px-2 py-1.5 align-middle">{r.attempts}</td>
                      <td className="px-2 py-1.5 align-middle">{r.correct}</td>
                      <td className="px-2 py-1.5 align-middle">{r.percent}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <BackLink onClick={() => setView("summary")} />
        </div>
      ) : view === "pitch" ? (
        <div className="flex flex-col gap-2">
          <SubHeader
            title="Pitch review — aggregated across all takes"
            main={`${pitchPct.toFixed(1)}%`}
            sub={`On pitch ${timeOnPitchPct}% • MAE ${pitchMae}¢`}
          />
          <div
            className={[
              "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
              "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
            ].join(" ")}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#6b6b6b]">
                  <th className="px-2 py-2">Note</th>
                  <th className="px-2 py-2">Solfege</th>
                  <th className="px-2 py-2">On-pitch %</th>
                  <th className="px-2 py-2">MAE (¢)</th>
                </tr>
              </thead>
              <tbody>
                {aggPitchRows.length === 0 ? (
                  <tr className="border-t border-[#eee]">
                    <td className="px-2 py-1.5" colSpan={4}>
                      No notes to evaluate.
                    </td>
                  </tr>
                ) : (
                  aggPitchRows.map((g) => (
                    <tr key={g.key} className="border-t border-[#eee]">
                      <td className="px-2 py-1.5 align-middle font-medium">
                        {g.label}
                      </td>
                      <td className="px-2 py-1.5 align-middle">{g.solf}</td>
                      <td className="px-2 py-1.5 align-middle">
                        {(g.meanRatio * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        {Math.round(g.meanMae)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <BackLink onClick={() => setView("summary")} />
        </div>
      ) : view === "melody" ? (
        visibility.showMelodyRhythm ? (
          <div className="flex flex-col gap-2">
            <SubHeader
              title="Melody rhythm — aggregated across all takes"
              main={`${melPct.toFixed(1)}%`}
              sub={`Hit ${melHit}% • μ|Δt| ${melMeanAbs}ms`}
            />
            <div
              className={[
                "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
                "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
              ].join(" ")}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#6b6b6b]">
                    <th className="px-2 py-2">Duration</th>
                    <th className="px-2 py-2">Coverage %</th>
                    <th className="px-2 py-2">First-voice μ|Δt|</th>
                  </tr>
                </thead>
                <tbody>
                  {aggMelodyRows.length === 0 ? (
                    <tr className="border-t border-[#eee]">
                      <td className="px-2 py-1.5" colSpan={3}>
                        No notes to evaluate.
                      </td>
                    </tr>
                  ) : (
                    aggMelodyRows.map((r) => (
                      <tr key={r.label} className="border-t border-[#eee]">
                        <td className="px-2 py-1.5 align-middle font-medium">
                          {r.label}
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          {(r.meanCoverage * 100).toFixed(1)}%
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          {Math.round(r.meanAbsOnset)}ms
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <BackLink onClick={() => setView("summary")} />
          </div>
        ) : null
      ) : (
        visibility.showRhythmLine && (
          <div className="flex flex-col gap-2">
            <SubHeader
              title="Rhythm line — aggregated across all takes"
              main={`${linePct.toFixed(1)}%`}
              sub={`Hit ${lineHit}% • μ|Δt| ${lineMeanAbs}ms`}
            />
            <div
              className={[
                "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
                "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
              ].join(" ")}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#6b6b6b]">
                    <th className="px-2 py-2">Duration</th>
                    <th className="px-2 py-2">Hit %</th>
                    <th className="px-2 py-2">μ|Δt|</th>
                  </tr>
                </thead>
                <tbody>
                  {aggLineRows.length === 0 ? (
                    <tr className="border-t border-[#eee]">
                      <td className="px-2 py-1.5" colSpan={3}>
                        Rhythm line was not evaluated across these takes.
                      </td>
                    </tr>
                  ) : (
                    aggLineRows.map((r) => (
                      <tr key={r.label} className="border-t border-[#eee]">
                        <td className="px-2 py-1.5 align-middle font-medium">
                          {r.label}
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          {(r.meanHit * 100).toFixed(0)}%
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          {Math.round(r.meanAbsErr)}ms
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <BackLink onClick={() => setView("summary")} />
          </div>
        )
      )}
    </div>
  );
}

function StaticRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={[
        "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
        "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
      ].join(" ")}
    >
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
        {label}
      </div>
      <div className="text-sm md:text-base text-[#0f0f0f] font-semibold">
        {value}
      </div>
    </div>
  );
}

function ClickableRow({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  onClick: () => void;
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
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
        {label}
      </div>
      <div className="text-sm md:text-base text-[#0f0f0f] font-semibold">
        {value}
      </div>
      {detail ? <div className="text-xs text-[#373737] mt-0.5">{detail}</div> : null}
    </button>
  );
}

function SubHeader({
  title,
  main,
  sub,
}: {
  title: string;
  main: string;
  sub?: string;
}) {
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
      <div className="text-sm md:text-base text-[#0f0f0f] font-semibold">
        {main}
      </div>
      {sub ? <div className="text-xs text-[#373737] mt-0.5">{sub}</div> : null}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start text-xs text-[#373737] hover:underline"
      title="Back to overall"
    >
      ← Back to overall
    </button>
  );
}
