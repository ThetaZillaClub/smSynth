// components/training/layout/stage/side-panel/SidePanelScores/MelodyRhythmReview.tsx
"use client";
import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { secondsToNoteName } from "./format";

function noteValueToUiName(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  const s = v.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fabricNoteLabels(melodyRhythm: RhythmEvent[] | null | undefined): string[] {
  const out: string[] = [];
  if (Array.isArray(melodyRhythm)) {
    for (const ev of melodyRhythm) {
      if ((ev as any)?.type === "note") {
        out.push(noteValueToUiName((ev as any)?.value));
      }
    }
  }
  return out;
}

export default function MelodyRhythmReview({
  score,
  phrase,
  bpm,
  den,
  melodyRhythm = null, // ← pass the melody rhythm fabric when available
}: {
  score: TakeScore;
  phrase: Phrase | null;
  bpm: number;
  den: number;
  melodyRhythm?: RhythmEvent[] | null;
}) {
  // Build per-note rows using the REAL melody rhythm when provided; otherwise fall back to phrase note durations.
  const noteRows = React.useMemo(() => {
    const notes = phrase?.notes ?? [];
    const per = Array.isArray(score.rhythm?.perNoteMelody) ? score.rhythm.perNoteMelody : [];
    const labelsFromFabric = fabricNoteLabels(melodyRhythm);

    const rows: { idx: number; label: string; dt: number | null; creditPct: number }[] = [];
    for (let i = 0; i < notes.length; i++) {
      const r = per?.[i] ?? {};
      const dt = typeof r?.onsetErrMs === "number" && Number.isFinite(r.onsetErrMs) ? Math.round(r.onsetErrMs) : null;
      const creditPct = Math.round(Math.max(0, Math.min(1, Number(r?.coverage ?? 0))) * 100);
      const label =
        (labelsFromFabric[i] as string | undefined) ??
        secondsToNoteName(notes[i]!.durSec, bpm, den);
      rows.push({ idx: i, label, dt, creditPct });
    }
    return rows;
  }, [score, phrase, bpm, den, melodyRhythm]);

  return (
    <div className="flex flex-col gap-2">
      <Header
        title="Melody rhythm (by note)"
        main={`${(score.rhythm.melodyPercent ?? 0).toFixed(1)}%`}
        sub={`Hit ${(score.rhythm.melodyHitRate * 100).toFixed(0)}% • μ|Δt| ${Math.round(
          score.rhythm.melodyMeanAbsMs
        )}ms`}
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
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Value</th>
              <th className="px-2 py-2">Δt (ms)</th>
              <th className="px-2 py-2">Credit</th>
            </tr>
          </thead>
          <tbody>
            {noteRows.length === 0 ? (
              <tr className="border-t border-[#eee]">
                <td className="px-2 py-1.5" colSpan={4}>
                  No melody timing rows to show.
                </td>
              </tr>
            ) : (
              noteRows.map((r) => (
                <tr key={r.idx} className="border-t border-[#eee]">
                  <td className="px-2 py-1.5 text-[#555]">{r.idx + 1}</td>
                  <td className="px-2 py-1.5 align-middle font-medium">{r.label}</td>
                  <td className="px-2 py-1.5 align-middle">{r.dt == null ? "—" : r.dt}</td>
                  <td className="px-2 py-1.5 align-middle">{`${r.creditPct}%`}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Header({ title, main, sub }: { title: string; main: string; sub?: string }) {
  return (
    <div
      className={[
        "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
        "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
      ].join(" ")}
    >
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{title}</div>
      <div className="text-sm md:text-base text-[#0f0f0f] font-semibold">{main}</div>
      {sub ? <div className="text-xs text-[#373737] mt-0.5">{sub}</div> : null}
    </div>
  );
}
