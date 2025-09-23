// components/training/layout/session/TrainingSessionPanel.tsx
"use client";
import React from "react";
import useUiRecordTimer from "./useUiRecordTimer";
import type { TimeSignature } from "@/utils/time/tempo";
import { secondsPerBeat, beatsToSeconds, barsToBeats } from "@/utils/time/tempo";

type Props = {
  statusText: string;
  isRecording: boolean;
  startedAtMs: number | null;

  /** Total record-window length in seconds (lead-in + phrase). */
  recordSec?: number;

  /** Rest window in seconds; if omitted we’ll compute from bpm/ts/restBars. */
  restSec?: number;

  /** Session caps */
  maxTakes: number;
  maxSessionSec: number;

  /** Musical transport (for display + calculations) */
  bpm?: number;                 // defaults to 80 if not provided
  ts?: TimeSignature;           // defaults to 4/4 if not provided
  /** Lead-in in bars (preferred) */
  leadBars?: number;
  restBars?: number;            // defaults to 1 bar
};

export default function TrainingSessionPanel({
  statusText,
  isRecording,
  startedAtMs,

  recordSec,
  restSec,

  maxTakes,
  maxSessionSec,

  bpm = 80,
  ts = { num: 4, den: 4 },
  leadBars,
  restBars = 1,
}: Props) {
  // --- derived musical timing ---
  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const leadBeatsEff = barsToBeats(typeof leadBars === "number" ? leadBars : 1, ts.num);
  const leadSec = beatsToSeconds(leadBeatsEff, bpm, ts.den);

  // Prefer provided recordSec; otherwise assume lead-in + 8-beat phrase
  const recordSecEff = typeof recordSec === "number" && isFinite(recordSec)
    ? recordSec
    : leadSec + beatsToSeconds(8, bpm, ts.den);
  const recordBeats = recordSecEff / secPerBeat;

  const restBeatsEff =
    typeof restBars === "number"
      ? barsToBeats(restBars, ts.num)
      : (typeof restSec === "number" ? restSec / secPerBeat : barsToBeats(1, ts.num));
  const restSecEff =
    typeof restSec === "number" && isFinite(restSec)
      ? restSec
      : beatsToSeconds(restBeatsEff, bpm, ts.den);

  // --- live UI timer (clamped to record window) ---
  const uiRecordSec = useUiRecordTimer(isRecording, startedAtMs);
  const uiRecordClamped = Math.min(uiRecordSec, recordSecEff);

  // --- helpers ---
  const fmtSec = (s: number) => (s < 10 ? s.toFixed(2) : s.toFixed(0)) + "s";
  const fmtBeats = (b: number) => (b % 1 === 0 ? `${b}` : b.toFixed(1));

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      {/* Status row */}
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="font-semibold">{statusText}</span>
          {isRecording && <span className="ml-2 opacity-70">{uiRecordClamped.toFixed(2)}s</span>}
        </div>
        <div className="text-xs opacity-70 font-mono">
          {bpm} BPM • {ts.num}/{ts.den}
        </div>
      </div>

      {/* Musical breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <InfoChip
          label="Lead-in"
          primary={`${fmtBeats(leadBeatsEff)} beats (${leadBars ?? 1} bar${(leadBars ?? 1) === 1 ? "" : "s"})`}
          secondary={fmtSec(leadSec)}
        />
        <InfoChip
          label="Record window"
          primary={`${fmtBeats(recordBeats)} beats`}
          secondary={fmtSec(recordSecEff)}
        />
        <InfoChip
          label="Rest"
          primary={`${restBars} bar${restBars === 1 ? "" : "s"} • ${fmtBeats(restBeatsEff)} beats`}
          secondary={fmtSec(restSecEff)}
        />
        <InfoChip
          label="Session caps"
          primary={`${maxTakes} takes`}
          secondary={`${Math.round(maxSessionSec / 60)} min`}
        />
      </div>
    </div>
  );
}

function InfoChip({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{label}</div>
      <div className="text-sm text-[#0f0f0f]">{primary}</div>
      {secondary ? <div className="text-xs text-[#2d2d2d]">{secondary}</div> : null}
    </div>
  );
}
