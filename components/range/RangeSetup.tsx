// components/range/RangeSetup.tsx
"use client";

import React from "react";
import RangeCapture from "@/components/range/RangeCapture";
import useRangeSteps from "@/components/range/useRangeSteps";

import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRangeUpdater from "@/hooks/students/useStudentRangeUpdater";

export default function RangeSetup({ studentId = null }: { studentId?: string | null }) {
  // who are we saving to?
  const { studentRowId, studentName } = useStudentRow({ studentIdFromQuery: studentId ?? null });
  const updateRange = useStudentRangeUpdater(studentRowId);

  // two-step flow (low → high), writes to Supabase via updateRange()
  const { step, lowHz, highHz, canPlay, confirmLow, confirmHigh } = useRangeSteps({ updateRange, a4Hz: 440 });

  // live pitch
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  const title = "Range Setup";
  const subtitle = studentName ? `Capture low & high notes for ${studentName}` : "Capture your lowest and highest comfortable notes";

  return (
    <div className="min-h-dvh h-dvh flex flex-col bg-[#f0f0f0] text-[#0f0f0f]">
      {/* Header */}
      <div className="w-full flex justify-center pt-4 px-6 pb-2">
        <div className="w-full max-w-7xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-[#2d2d2d] mt-1">{subtitle}</p>
          {error && <p className="text-sm text-red-600 mt-1">Mic error: {error}</p>}
          {!isReady && <p className="text-sm text-[#6b6b6b] mt-1">Initializing microphone…</p>}
        </div>
      </div>

      {/* Body */}
      <div className="w-full flex-1 flex flex-col gap-4 min-h-0 px-6 pb-6">
        <div className="w-full max-w-7xl mx-auto mt-2 space-y-3">
          {step === "low" && (
            <RangeCapture
              key="capture-low"
              mode="low"
              active
              pitchHz={liveHz}
              holdSec={1}               // 1s steady hold (kept from your existing default)
              centsWindow={75}
              a4Hz={440}
              onConfirm={confirmLow}
            />
          )}

          {step === "high" && (
            <RangeCapture
              key="capture-high"
              mode="high"
              active
              pitchHz={liveHz}
              holdSec={1}
              centsWindow={75}
              a4Hz={440}
              onConfirm={confirmHigh}
            />
          )}

          {/* Simple live readout */}
          <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Live Pitch</div>
            <div className="text-sm text-[#0f0f0f]">
              {liveHz ? `${liveHz.toFixed(1)} Hz` : "—"}
              <span className="ml-2 text-xs text-[#6b6b6b]">conf {confidence.toFixed(2)}</span>
            </div>
          </div>

          {/* Success state */}
          {canPlay && (
            <div className="rounded-lg border border-[#d2d2d2] bg-white/60 p-3">
              <div className="text-sm">
                ✅ Range saved to your profile. You can go back and start the Training exercise.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
