// components/range/stage/RangeStage.tsx
"use client";

import React, { useMemo, useState, useCallback } from "react";
import RangeCapture from "@/components/setup/range/RangeCapture";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import RangeFooter from "./RangeFooter";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";

type Step = "low" | "high";

export default function RangeStage({
  step,
  onConfirmLow,
  onConfirmHigh,
  a4Hz = 440,
}: {
  step: Step;
  onConfirmLow: (hz: number, label: string) => void;
  onConfirmHigh: (hz: number, label: string) => void;
  a4Hz?: number;
}) {
  // Always-on pitch (mirrors Training)
  const { pitch, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  // UI state
  const [progressPct, setProgressPct] = useState(0);
  const [capturedHz, setCapturedHz] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [done, setDone] = useState(false);

  const displayNote = useMemo(() => {
    if (capturedHz == null) return null;
    const m = Math.round(hzToMidi(capturedHz, a4Hz));
    const hz = a4Hz * Math.pow(2, (m - 69) / 12);
    const n = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
    return `${n.name}${n.octave} • ${hz.toFixed(1)} Hz`;
  }, [capturedHz, a4Hz]);

  const reset = useCallback(() => {
    setCapturedHz(null);
    setProgressPct(0);
    setDone(false);
    setResetKey((k) => k + 1); // force RangeCapture internal reset
  }, []);

  const confirm = useCallback(() => {
    if (capturedHz == null) return;
    const m = Math.round(hzToMidi(capturedHz, a4Hz));
    const hz = a4Hz * Math.pow(2, (m - 69) / 12);
    const n = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
    const label = `${n.name}${n.octave}`;
    if (step === "low") {
      onConfirmLow(hz, label);
      // parent advances step → "high"; keep mic running, clear capture
      setCapturedHz(null);
      setProgressPct(0);
    } else {
      onConfirmHigh(hz, label);
      setDone(true); // show ✅ & Restart
    }
  }, [capturedHz, a4Hz, onConfirmLow, onConfirmHigh, step]);

  return (
    <div className="w-full h-full flex flex-col bg-transparent" style={{ cursor: "default" }}>
      {/* STAGE AREA */}
      <div className="relative flex-1 min-h-0 bg-transparent flex items-center justify-center px-4">
        <RangeCapture
          mode={step}
          active={true}             // 🔥 always capturing; no start/stop
          pitchHz={liveHz}
          holdSec={1}
          centsWindow={75}
          a4Hz={a4Hz}
          showActions={false}
          resetKey={resetKey}
          onCompleted={(hz) => setCapturedHz(hz)}
          onVisual={(sec, target) => {
            const pct = Math.max(0, Math.min(100, (sec / Math.max(0.001, target)) * 100));
            setProgressPct(pct);
          }}
        />
      </div>

      {/* FOOTER */}
      <RangeFooter
        step={step}
        progressPct={progressPct}
        displayNote={displayNote}
        hasCapture={capturedHz != null}
        isDone={done}
        error={!isReady && !error ? "Initializing microphone…" : error ?? null}
        onReset={reset}
        onConfirm={confirm}
      />
    </div>
  );
}
