"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { hzToNoteName, centsBetweenHz } from "@/utils/pitch/pitchMath";

type Props = {
  mode: "low" | "high";
  /** capture is active while this is true */
  active: boolean;

  pitchHz: number | null | undefined;
  confidence: number;
  confThreshold?: number;

  bpm?: number;             // default 60
  beatsRequired?: number;   // default 1 (≈1 second at 60 BPM)
  centsWindow?: number;     // tolerance for "stable hold", DEFAULT 75¢

  a4Hz?: number;            // default 440
  onConfirm: (capturedHz: number) => void;
};

export default function RangeCapture({
  mode,
  active,
  pitchHz,
  confidence,
  confThreshold = 0.5,
  bpm = 60,
  beatsRequired = 1,  // 1 beat at 60 BPM = 1 second
  centsWindow = 75,   // relaxed tolerance
  a4Hz = 440,
  onConfirm,
}: Props) {
  const targetSec = useMemo(() => (60 / bpm) * beatsRequired, [bpm, beatsRequired]);

  const [progressSec, setProgressSec] = useState(0);
  const [capturedHz, setCapturedHz] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const baseHzRef = useRef<number | null>(null);
  const bufRef = useRef<number[]>([]);

  const effectiveHz =
    typeof pitchHz === "number" && confidence >= confThreshold ? pitchHz : null;

  const hardReset = () => {
    baseHzRef.current = null;
    bufRef.current = [];
    setProgressSec(0);
    setCapturedHz(null);
    setCompleted(false);
  };

  const tick = (ts: number) => {
    if (!active) {
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const last = lastTsRef.current ?? ts;
    lastTsRef.current = ts;
    const dt = Math.max(0, (ts - last) / 1000);

    if (completed) {
      // Freeze progress & captured value until user confirms or restarts
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    if (effectiveHz == null) {
      hardReset();
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    if (baseHzRef.current == null) {
      baseHzRef.current = effectiveHz;
      bufRef.current = [effectiveHz];
      setProgressSec(0);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const cents = centsBetweenHz(effectiveHz, baseHzRef.current);
    if (Math.abs(cents) > centsWindow) {
      // out of window → restart hold
      baseHzRef.current = effectiveHz;
      bufRef.current = [effectiveHz];
      setProgressSec(0);
      setCapturedHz(null);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const nextProgress = Math.min(targetSec, progressSec + dt);
    setProgressSec(nextProgress);

    // keep a small buffer to compute median
    bufRef.current.push(effectiveHz);
    if (bufRef.current.length > 60) bufRef.current.shift();

    // if we reached the target duration, lock-in
    if (nextProgress >= targetSec) {
      const sorted = [...bufRef.current].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      setCapturedHz(med);
      setCompleted(true); // show confirm UI automatically
    }

    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, effectiveHz, confThreshold, centsWindow, targetSec]);

  // UI text
  const title =
    mode === "low"
      ? "Step 1 — Sing your lowest comfortable note"
      : "Step 2 — Sing your highest comfortable note";
  const sub = "Hold it steadily for 1 beat (≈1 second).";

  const progressPct = Math.min(100, Math.round((progressSec / targetSec) * 100));

  const display =
    capturedHz != null
      ? (() => {
          const n = hzToNoteName(capturedHz, a4Hz, { useSharps: true });
          return `${n.name}${n.octave} • ${capturedHz.toFixed(1)} Hz`;
        })()
      : "—";

  return (
    <div className="w-full max-w-5xl rounded-md border border-[#d2d2d2] bg-[#ebebeb] p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-[#0f0f0f]">{title}</h2>
          <p className="text-sm text-[#2d2d2d]">{sub}</p>
        </div>
        <div className="text-sm text-[#2d2d2d]">
          Target: <span className="font-mono">{targetSec.toFixed(1)}s</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="h-2 w-full bg-[#dcdcdc] rounded overflow-hidden">
          <div
            className="h-full bg-[#0f0f0f] transition-[width] duration-100"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-2 text-sm text-[#2d2d2d]">
          Hold progress: <span className="font-mono">{progressSec.toFixed(2)}s</span> /{" "}
          <span className="font-mono">{targetSec.toFixed(2)}s</span>
        </div>
      </div>

      {/* Readout + actions */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-md p-4 bg-white/60 border border-[#d2d2d2]">
          <div className="text-[#2d2d2d]">Detected (stable)</div>
          <div className="text-xl font-mono text-[#0f0f0f]">{display}</div>
        </div>

        <div className="flex items-center sm:justify-end gap-2">
          {!completed ? (
            // While singing: no clickable actions (prevents interaction)
            <button
              type="button"
              disabled
              className="px-4 h-11 rounded-md bg-[#0f0f0f] text-[#f0f0f0] opacity-40 cursor-not-allowed"
              aria-disabled
            >
              {/* Placeholder so layout doesn't jump */}
              Holding…
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={hardReset}
                className="px-4 h-11 rounded-md bg-[#ebebeb] border border-[#d2d2d2] text-[#0f0f0f] hover:opacity-90 active:scale-[0.98]"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => capturedHz != null && onConfirm(capturedHz)}
                className="px-4 h-11 rounded-md bg-[#0f0f0f] text-[#f0f0f0] font-medium transition duration-200 hover:opacity-90 active:scale-[0.98]"
              >
                {mode === "low" ? "Confirm Low Note" : "Confirm High Note"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
