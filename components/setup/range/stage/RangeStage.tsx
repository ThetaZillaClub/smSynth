// components/setup/range/stage/RangeStage.tsx
"use client";

import React, { useMemo, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import RangeFooter from "./RangeFooter";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import RangePolarStage from "./RangePolarStage";
import RangeStepText from "./RangeStepText";

type Step = "low" | "high";
const HOLD_SEC = 1;

export default function RangeStage({
  step,
  onConfirmLow,
  onConfirmHigh,
  onRestart,   // parent’s hard restart (remount)
  a4Hz = 440,
}: {
  step: Step;
  onConfirmLow: (hz: number, label: string) => void;
  onConfirmHigh: (hz: number, label: string) => void;
  onRestart: () => void;
  a4Hz?: number;
}) {
  const { pitch, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  const [running, setRunning] = useState(false);
  const [capturedHz, setCapturedHz] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [done, setDone] = useState(false);

  const displayNote = useMemo(() => {
    if (capturedHz == null) return null;
    const m = Math.round(hzToMidi(capturedHz, a4Hz));
    const n = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
    return `${n.name}${n.octave}`;
  }, [capturedHz, a4Hz]);

  const toggleRunning = useCallback(() => {
    if (capturedHz != null || done) return;
    setRunning((r) => !r);
  }, [capturedHz, done]);

  // Per-capture soft reset (kept)
  const softReset = useCallback(() => {
  flushSync(() => {
    setRunning(false);
    setCapturedHz(null);
    setDone(false);
    setResetKey((k) => k + 1);
  });
  }, []);

  // Completion “Restart” now delegates to parent hard reset (one click)
  const fullRestart = useCallback(() => {
    onRestart(); // parent clears steps + remounts stage via key
  }, [onRestart]);

  const confirm = useCallback(() => {
    if (capturedHz == null) return;
    const m = Math.round(hzToMidi(capturedHz, a4Hz));
    const hz = a4Hz * Math.pow(2, (m - 69) / 12);
    const n = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
    const label = `${n.name}${n.octave}`;
    if (step === "low") {
      onConfirmLow(hz, label);
      setCapturedHz(null);
      setRunning(false);
    } else {
      onConfirmHigh(hz, label);
      setDone(true);
      setRunning(false);
    }
  }, [capturedHz, a4Hz, onConfirmLow, onConfirmHigh, step]);

  return (
    <div className="w-full h-full flex flex-col bg-transparent" style={{ cursor: "default" }}>
      {/* STAGE */}
      {done ? (
        <div className="relative flex-1 min-h-0 bg-transparent flex items-center justify-center px-4">
          <div className="w-[90%] max-w-3xl mx-auto text-center select-none">
            <div className="text-[clamp(1rem,2.2vw,1.25rem)] leading-snug text-[#0f0f0f]">
              ✅ Range captured — you can head back to Training anytime.
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex-1 min-h-0 bg-transparent flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-4xl mx-auto">
            <RangeStepText step={step} holdSec={HOLD_SEC} section="top" />
          </div>

          <div className="w-full max-w-4xl mx-auto h-[clamp(150px,56vh,560px)]">
            <RangePolarStage
              mode={step}
              active={running}
              pitchHz={liveHz}
              holdSec={HOLD_SEC}
              centsWindow={75}
              a4Hz={a4Hz}
              resetKey={resetKey}
              onCaptured={(hz) => {
                setCapturedHz(hz);
                setRunning(false);
              }}
            />
          </div>

          <div className="w-[90%] mx-auto mt-3 md:mt-4">
            <RangeStepText step={step} holdSec={HOLD_SEC} section="bottom" />
          </div>
        </div>
      )}

      {/* FOOTER */}
      <RangeFooter
        displayNote={displayNote}
        hasCapture={capturedHz != null}
        isDone={done}
        error={!isReady && !error ? "Initializing microphone…" : error ?? null}
        running={running}
        onToggle={toggleRunning}
        onReset={softReset}     // per-capture
        onRestart={fullRestart} // completion restart -> parent remount
        onConfirm={confirm}
      />
    </div>
  );
}
