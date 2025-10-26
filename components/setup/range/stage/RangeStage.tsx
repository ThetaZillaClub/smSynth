// components/setup/range/stage/RangeStage.tsx
"use client";

import React, { useMemo, useState, useCallback } from "react";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import RangeFooter from "./RangeFooter";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import RangePolarStage from "./RangePolarStage";
import RangeStepText from "./RangeStepText";

type Step = "low" | "high";

const HOLD_SEC = 1; // single-pitch hold target

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
  // Always-on pitch (for live label preview even while paused)
  const { pitch, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  // UI state
  const [running, setRunning] = useState(false); // play/pause
  const [progressPct, setProgressPct] = useState(0);
  const [capturedHz, setCapturedHz] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [done, setDone] = useState(false);

  // Footer shows ONLY the musical note label (no Hz)
  const displayNote = useMemo(() => {
    if (capturedHz == null) return null;
    const m = Math.round(hzToMidi(capturedHz, a4Hz));
    const n = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
    return `${n.name}${n.octave}`;
  }, [capturedHz, a4Hz]);

  const toggleRunning = useCallback(() => {
    // If already captured, toggling play is disabled by UI (confirm button shows instead).
    if (capturedHz != null || done) return;
    setRunning((r) => !r);
    // When pausing, ensure progress cleared visually
    if (running) {
      setProgressPct(0);
    }
  }, [capturedHz, done, running]);

  const reset = useCallback(() => {
    setRunning(false);
    setCapturedHz(null);
    setProgressPct(0);
    setDone(false);
    setResetKey((k) => k + 1); // force RangePolarStage internal reset
  }, []);

  const confirm = useCallback(() => {
    if (capturedHz == null) return;
    // Snap for persistence + consistency
    const m = Math.round(hzToMidi(capturedHz, a4Hz));
    const hz = a4Hz * Math.pow(2, (m - 69) / 12);
    const n = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
    const label = `${n.name}${n.octave}`;
    if (step === "low") {
      onConfirmLow(hz, label);
      // move to high; keep paused until user presses Play again
      setCapturedHz(null);
      setProgressPct(0);
      setRunning(false);
    } else {
      onConfirmHigh(hz, label);
      setDone(true);      // show ✅ & Restart
      setRunning(false);  // capturing stops
    }
  }, [capturedHz, a4Hz, onConfirmLow, onConfirmHigh, step]);

  return (
    <div className="w-full h-full flex flex-col bg-transparent" style={{ cursor: "default" }}>
      {/* STAGE AREA */}
      <div className="relative flex-1 min-h-0 bg-transparent flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-4xl mx-auto">
          <RangeStepText step={step} holdSec={HOLD_SEC} />
        </div>

        {/* Height is fluid but clamped so it never vanishes on small viewports */}
        <div className="w-full max-w-4xl mx-auto h-[clamp(150px,56vh,560px)]">
          <RangePolarStage
            mode={step}
            active={running}           // 🔥 progress only while running
            pitchHz={liveHz}           // live label always shown
            holdSec={HOLD_SEC}
            centsWindow={75}
            a4Hz={a4Hz}
            resetKey={resetKey}
            onCaptured={(hz) => {
              setCapturedHz(hz);
              setRunning(false);      // stop capture; footer flips to green Confirm
            }}
            onProgress={(p01) => setProgressPct(Math.round(p01 * 100))}
          />
        </div>
      </div>

      {/* FOOTER */}
      <RangeFooter
        step={step}
        progressPct={progressPct}
        displayNote={displayNote}
        hasCapture={capturedHz != null}
        isDone={done}
        error={!isReady && !error ? "Initializing microphone…" : error ?? null}
        running={running}
        onToggle={toggleRunning}
        onReset={reset}
        onConfirm={confirm}
      />
    </div>
  );
}
