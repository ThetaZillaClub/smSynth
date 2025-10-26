// components/setup/range/RangeSetup.tsx
"use client";

import React, { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import useRangeSteps from "@/components/setup/range/useRangeSteps";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRangeUpdater from "@/hooks/students/useStudentRangeUpdater";
import RangeStage from "@/components/setup/range/stage/RangeStage";

export default function RangeSetup({ studentId = null }: { studentId?: string | null }) {
  const { studentRowId } = useStudentRow({ studentIdFromQuery: studentId ?? null });
  const updateRange = useStudentRangeUpdater(studentRowId);

  const { step, setStep, confirmLow, confirmHigh, resetAll } = useRangeSteps({
    updateRange,
    a4Hz: 440,
  });

  // NEW: a top-level session id; bump only for *full* restarts
  const [sessionId, setSessionId] = useState(0);

  const onConfirmLow = (hz: number, _label: string) => {
    confirmLow(hz);
    setStep("high");
  };

  const onConfirmHigh = (hz: number, _label: string) => {
    confirmHigh(hz);
    // hook moves to "play"; the stage will show done
  };

  // Bullet-proof full restart, flushed synchronously
  const onRestart = useCallback(() => {
    flushSync(() => {
      resetAll();                 // clear low/high + step -> "low"
      setSessionId((n) => n + 1); // remount the whole stage tree once
    });
  }, [resetAll]);

  return (
    <div className="min-h-dvh h-dvh flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <div className="flex-1 min-h-0">
        {/* key ONLY changes on full restart; per-capture resets stay smooth */}
        <RangeStage
          key={sessionId}
          step={step === "play" ? "high" : step}
          onConfirmLow={onConfirmLow}
          onConfirmHigh={onConfirmHigh}
          onRestart={onRestart}
          a4Hz={440}
        />
      </div>
    </div>
  );
}
