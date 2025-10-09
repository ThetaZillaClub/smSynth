// components/range/RangeSetup.tsx
"use client";

import React, { useMemo } from "react";
import useRangeSteps from "@/components/setup/range/useRangeSteps";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRangeUpdater from "@/hooks/students/useStudentRangeUpdater";
import RangeStage from "@/components/setup/range/stage/RangeStage";

export default function RangeSetup({ studentId = null }: { studentId?: string | null }) {
  const { studentRowId } = useStudentRow({ studentIdFromQuery: studentId ?? null });
  const updateRange = useStudentRangeUpdater(studentRowId);

  // low → high → play (we use low/high here)
  const { step, setStep, confirmLow, confirmHigh } = useRangeSteps({ updateRange, a4Hz: 440 });

  const onConfirmLow = (hz: number, label: string) => {
    confirmLow(hz); // persists label inside hook; we pass hz to keep signatures simple
    setStep("high");
  };

  const onConfirmHigh = (hz: number, label: string) => {
    confirmHigh(hz);
    // stays in "play" internally; the stage will show "done"
  };

  return (
    <div className="min-h-dvh h-dvh flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <div className="flex-1 min-h-0">
        <RangeStage
          step={step === "play" ? "high" : step} // ensure stage shows done after high
          onConfirmLow={onConfirmLow}
          onConfirmHigh={onConfirmHigh}
          a4Hz={440}
        />
      </div>
    </div>
  );
}
