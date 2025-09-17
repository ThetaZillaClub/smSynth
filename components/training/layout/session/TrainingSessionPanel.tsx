// components/game-layout/session/TrainingSessionPanel.tsx
"use client";
import React from "react";
import useUiRecordTimer from "./useUiRecordTimer";

type Props = {
  statusText: string;
  isRecording: boolean;
  startedAtMs: number | null;
  recordSec: number;
  restSec: number;
  maxTakes: number;
  maxSessionSec: number;
};

export default function TrainingSessionPanel({
  statusText,
  isRecording,
  startedAtMs,
  recordSec,
  restSec,
  maxTakes,
  maxSessionSec,
}: Props) {
  const uiRecordSec = useUiRecordTimer(isRecording, startedAtMs);
  const uiRecordClamped = Math.min(uiRecordSec, recordSec);

  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="font-semibold">{statusText}</span>
          {isRecording && <span className="ml-2 opacity-70">{uiRecordClamped.toFixed(2)}s</span>}
        </div>
      </div>
      <div className="text-xs opacity-70">
        Record {recordSec}s → Rest {restSec}s. Auto-stops by {maxTakes} takes or {Math.round(maxSessionSec / 60)} minutes.
      </div>
    </div>
  );
}
