// components/setup/range/RangeSetup.tsx
"use client";

import React, { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import useRangeSteps from "@/components/setup/range/useRangeSteps";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRangeUpdater from "@/hooks/students/useStudentRangeUpdater";
import RangeStage from "@/components/setup/range/stage/RangeStage";
import { fetchJsonNoStore } from "@/components/sidebar/fetch/noStore";

export default function RangeSetup({ studentId = null }: { studentId?: string | null }) {
  const { studentRowId } = useStudentRow({ studentIdFromQuery: studentId ?? null });
  const updateRange = useStudentRangeUpdater(studentRowId);

  const { step, setStep, confirmLow, confirmHigh, resetAll, canPlay } = useRangeSteps({
    updateRange,
    a4Hz: 440,
  });

  // Auto-return support
  const router = useRouter();
  const search = useSearchParams();
  const nextRaw = search?.get("next") ?? null;
  // Guard: only allow internal paths
  const nextPath = nextRaw && nextRaw.startsWith("/") ? nextRaw : null;

  // Top-level session id; bump only for full restarts
  const [sessionId, setSessionId] = useState(0);

  const onConfirmLow = (hz: number, label: string) => {
    void label; // keep signature but ignore
    confirmLow(hz);
    setStep("high");
  };

  const onConfirmHigh = (hz: number, label: string) => {
    void label; // keep signature but ignore
    confirmHigh(hz);
    // hook moves to "play"; the stage will show done
  };

  // Full restart (hard reset + remount)
  const onRestart = useCallback(() => {
    flushSync(() => {
      resetAll();                 // clear low/high + step -> "low"
      setSessionId((n) => n + 1); // remount stage tree once
    });
  }, [resetAll]);

  // After both low+high are confirmed (canPlay), bounce back to ?next=
  // Poll the same endpoint the gate uses to avoid racing the DB write.
  React.useEffect(() => {
    if (!nextPath || !canPlay) return;
    let cancelled = false;

    const checkAndReturn = async () => {
      // Up to ~3s of quick polling; then navigate anyway (lesson/course re-checks too).
      for (let i = 0; i < 12 && !cancelled; i++) {
        try {
          const row = await fetchJsonNoStore<{ range_low: string | null; range_high: string | null }>(
            "/api/students/current/range"
          );
          const ready =
            !!row &&
            typeof row.range_low === "string" && !!row.range_low &&
            typeof row.range_high === "string" && !!row.range_high;
          if (ready) {
            if (!cancelled) router.replace(nextPath);
            return;
          }
        } catch {
          // ignore transient errors and retry
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!cancelled) router.replace(nextPath);
    };

    checkAndReturn();
    return () => {
      cancelled = true;
    };
  }, [canPlay, nextPath, router]);

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
