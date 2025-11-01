// components/training/layout/stage/side-panel/SidePanelScores/MelodyRhythmReview.tsx
"use client";
import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";
import type { Phrase } from "@/utils/stage";
import { secondsToNoteName } from "./format";
type MelodyDurationRow = {
  durationLabel?: string;
  attempts?: number;
  hits?: number;
  hitPct?: number;
  firstVoiceMuAbsMs?: number;
};
type PerNoteMelodyRow = {
  coverage?: number;
  onsetErrMs?: number | null;
};
export default function MelodyRhythmReview({
  score,
  phrase,
  bpm,
  den,
}: {
  score: TakeScore;
  phrase: Phrase | null;
  bpm: number;
  den: number;
}) {
  // Preferred: aggregated rows provided by scoring
  const rows = React.useMemo(() => {
    const byDur = Array.isArray(score.rhythm?.melodyByDuration)
      ? (score.rhythm.melodyByDuration ?? [])
      : [];
    if (byDur.length) {
      return byDur.map((r: MelodyDurationRow) => {
        const attempts = Math.max(0, Number(r.attempts ?? 0));
        const hits =
          r.hits != null ? Math.max(0, Number(r.hits)) : Math.max(0, Number(r.hitPct ?? 0)) * attempts / 100;
        const pct = attempts ? Math.round((100 * hits) / attempts) : null;
        return {
          label: String(r.durationLabel ?? "All"),
          hitPct: pct,
          muAbsMs: r.firstVoiceMuAbsMs != null ? Math.round(Number(r.firstVoiceMuAbsMs)) : null,
        };
      });
    }
    // Fallback: derive from legacy per-note coverage grouped by duration
    const notes = phrase?.notes ?? [];
    const per = Array.isArray(score.rhythm?.perNoteMelody) ? score.rhythm.perNoteMelody : [];
    type Acc = { sumPct: number; n: number; muSum: number; muN: number };
    const m = new Map<string, Acc>();
    for (let i = 0; i < notes.length; i++) {
      const r: PerNoteMelodyRow = per?.[i] ?? {};
      if (typeof r.coverage !== "number") continue;
      const label = secondsToNoteName(notes[i]!.durSec, bpm, den);
      const a = m.get(label) ?? { sumPct: 0, n: 0, muSum: 0, muN: 0 };
      a.sumPct += Math.round(Number(r.coverage) * 100);
      a.n += 1;
      if (Number.isFinite(r.onsetErrMs)) {
        a.muSum += Math.abs(Number(r.onsetErrMs));
        a.muN += 1;
      }
      m.set(label, a);
    }
    return Array.from(m.entries()).map(([label, a]) => ({
      label,
      hitPct: a.n ? Math.round(a.sumPct / a.n) : null,
      muAbsMs: a.muN ? Math.round(a.muSum / a.muN) : null,
    }));
  }, [score, phrase, bpm, den]);
  return (
    <div className="flex flex-col gap-2">
      <Header
        title="Melody rhythm (hit rate by note value)"
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
              <th className="px-2 py-2">Duration</th>
              <th className="px-2 py-2">Hit %</th>
              <th className="px-2 py-2">First-voice μ|Δt|</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#eee]">
                <td className="px-2 py-1.5" colSpan={3}>
                  No melody timing rows to show.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.label}-${i}`} className="border-t border-[#eee]">
                  <td className="px-2 py-1.5 align-middle font-medium">{r.label}</td>
                  <td className="px-2 py-1.5 align-middle">{r.hitPct == null ? "—" : `${r.hitPct}%`}</td>
                  <td className="px-2 py-1.5 align-middle">{r.muAbsMs == null ? "—" : `${r.muAbsMs}ms`}</td>
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