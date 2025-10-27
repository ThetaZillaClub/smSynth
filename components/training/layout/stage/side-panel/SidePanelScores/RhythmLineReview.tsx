// components/training/layout/stage/side-panel/SidePanelScores/RhythmLineReview.tsx
"use client";
import * as React from "react";
import type { TakeScore } from "@/utils/scoring/score";

export default function RhythmLineReview({ score }: { score: TakeScore }) {
  const meta = (score as any).__rhythmLine as
    | {
        skippedReason: string | null;
        expectedBeatsCount: number;
        capturedBeatsCount: number;
        usingVisionBeats: boolean;
        timingFree: boolean;
        haveRhythm: boolean;
      }
    | undefined;

  if (!score.rhythm.lineEvaluated) {
    // Build a friendly reason string
    let reason = "Rhythm line was not evaluated for this take.";
    const details: string[] = [];

    if (meta?.skippedReason) {
      switch (meta.skippedReason) {
        case "timing_free":
          reason = "Rhythm line was not evaluated because this lesson ran in free-time mode.";
          break;
        case "line_disabled":
          reason = "Rhythm line was not evaluated because the rhythm line was disabled for this take.";
          break;
        case "no_expected_onsets":
          reason = "Rhythm line was not evaluated because there were no expected rhythm-line onsets.";
          break;
        case "no_taps_captured":
          reason = "Rhythm line was not evaluated because no hand taps were captured during the response window.";
          break;
        case "scorer_missing_onsets":
          reason =
            "Rhythm line data was captured, but the scorer did not receive the expected beat grid.";
          break;
        default:
          reason = "Rhythm line was not evaluated.";
      }
    }

    if (typeof meta?.expectedBeatsCount === "number") {
      details.push(`Expected beats: ${meta.expectedBeatsCount}`);
    }
    if (typeof meta?.capturedBeatsCount === "number") {
      details.push(`Captured taps: ${meta.capturedBeatsCount}`);
    }
    if (meta?.usingVisionBeats === true) {
      details.push("Input: vision hand-taps");
    }

    // Contextual hint
    const hint =
      meta?.skippedReason === "scorer_missing_onsets"
        ? "Tip: Ensure rhythmLineOnsetsSec is forwarded to computeTakeScore → computeRhythmScore."
        : "Tip: Make sure the lesson has a rhythm line, camera access is granted, and taps are clearly visible.";

    return (
      <div
        className={[
          "w-full text-left rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
          "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
        ].join(" ")}
      >
        <div className="text-sm">{reason}</div>
        {details.length > 0 && <div className="text-xs text-[#444] mt-1">{details.join(" • ")}</div>}
        <div className="text-xs text-[#444] mt-1">{hint}</div>
      </div>
    );
  }

  const rows = score.rhythm.linePerEvent ?? [];

  return (
    <div className="flex flex-col gap-2">
      <Header
        title="Rhythm line (hand taps vs. blue line)"
        main={`${score.rhythm.linePercent.toFixed(1)}%`}
        sub={`Hit ${(score.rhythm.lineHitRate * 100).toFixed(0)}% • μ|Δt| ${Math.round(
          score.rhythm.lineMeanAbsMs
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
              <th className="px-2 py-2">Expected</th>
              <th className="px-2 py-2">Tap</th>
              <th className="px-2 py-2">Δt (ms)</th>
              <th className="px-2 py-2">Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#eee]">
                <td className="px-2 py-1.5" colSpan={5}>No onsets to evaluate.</td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const dt = r.errMs == null ? "—" : Math.round(r.errMs).toString();
                const creditPct = `${Math.round(r.credit * 100)}%`;
                return (
                  <tr key={i} className="border-t border-[#eee]">
                    <td className="px-2 py-1.5 text-[#555]">{r.idx + 1}</td>
                    <td className="px-2 py-1.5">{r.expSec.toFixed(3)}s</td>
                    <td className="px-2 py-1.5">
                      {r.tapSec == null ? "—" : `${r.tapSec.toFixed(3)}s`}
                    </td>
                    <td className="px-2 py-1.5">{dt}</td>
                    <td className="px-2 py-1.5">{creditPct}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-[#444]">
        Tip: Hit rate counts expected beats that have a sufficiently close tap. Mean absolute error
        summarizes timing deviation for those hits.
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
