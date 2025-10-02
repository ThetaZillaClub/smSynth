// components/training/session/PretestPanel.tsx
"use client";

import React from "react";

export default function PretestPanel({
  statusText,
  detail,
  running,
  onStart,
  onContinue,
  onReset,
}: {
  statusText: string;
  detail?: string;
  running: boolean;
  onStart: () => void;
  onContinue: () => void;
  onReset: () => void;
}) {
  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{statusText}</div>
        <div className="flex items-center gap-2">
          {!running ? (
            <button
              type="button"
              onClick={onStart}
              className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-[#0f0f0f] text-[#f0f0f0] text-sm hover:opacity-90"
              title="Start pre-test"
            >
              Start pre-test
            </button>
          ) : (
            <button
              type="button"
              onClick={onReset}
              className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-[#0f0f0f] text-sm hover:bg-[#f8f8f8]"
              title="Reset pre-test"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {detail ? <div className="text-sm text-[#2d2d2d]">{detail}</div> : null}

      {/* Continue button appears during student response */}
      {running ? (
        <div>
          <button
            type="button"
            onClick={onContinue}
            className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] text-[#0f0f0f] text-sm hover:bg-white transition shadow-sm"
            title="I'm finished singing this response"
          >
            I’m done → Continue
          </button>
        </div>
      ) : null}
    </div>
  );
}
