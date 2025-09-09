// components/game-layout/TrainingSessionPanel.tsx
"use client";
import React from "react";

type Props = {
  statusText: string;
  isRecording: boolean;
  uiRecordSec: number;
  recordSec: number;
  restSec: number;
  maxTakes: number;
  maxSessionSec: number;
};

export default function TrainingSessionPanel({
  statusText,
  isRecording,
  uiRecordSec,
  recordSec,
  restSec,
  maxTakes,
  maxSessionSec,
}: Props) {
  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="font-semibold">{statusText}</span>
          {isRecording && <span className="ml-2 opacity-70">{uiRecordSec.toFixed(2)}s</span>}
        </div>
      </div>
      <div className="text-xs opacity-70">
        Record {recordSec}s → Rest {restSec}s. Auto-stops by {maxTakes} takes or {Math.round(maxSessionSec / 60)} minutes.
      </div>
    </div>
  );
}
