// components/training/layout/range/RangeCapture.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { hzToNoteName, centsBetweenHz } from "@/utils/pitch/pitchMath";

type Props = {
  mode: "low" | "high";
  /** capture is active while this is true */
  active: boolean;

  pitchHz: number | null | undefined;

  /** OPTIONAL: fixed hold time in seconds (overrides bpm/beatsRequired if provided). */
  holdSec?: number;

  /** Musical alternative (used only if holdSec is not provided) */
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

  holdSec,

  bpm = 60,
  beatsRequired = 1,

  centsWindow = 75,
  a4Hz = 440,
  onConfirm,
}: Props) {
  /* ------------------- timing/targets ------------------- */
  const targetSec = useMemo(
    () => (typeof holdSec === "number" && isFinite(holdSec) && holdSec > 0 ? holdSec : (60 / bpm) * beatsRequired),
    [holdSec, bpm, beatsRequired]
  );

  // Captured value + which mode it belongs to
  const [capturedHz, setCapturedHz] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [capturedFor, setCapturedFor] = useState<"low" | "high" | null>(null);
  const capturedForRef = useRef<"low" | "high" | null>(null);
  useEffect(() => { capturedForRef.current = capturedFor; }, [capturedFor]);

  /* ---------------- latest input refs ------------------- */
  const latestActive = useRef(active);
  const latestPitch = useRef<number | null>(pitchHz ?? null);
  const latestCentsWindow = useRef<number>(centsWindow);
  const latestTargetSec = useRef<number>(targetSec);

  useLayoutEffect(() => { latestActive.current = active; }, [active]);
  useLayoutEffect(() => { latestPitch.current = (typeof pitchHz === "number" ? pitchHz : null); }, [pitchHz]);
  useLayoutEffect(() => { latestCentsWindow.current = centsWindow; }, [centsWindow]);
  useLayoutEffect(() => { latestTargetSec.current = targetSec; }, [targetSec]);

  /* ------------------- internal refs -------------------- */
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // Anchor that follows the singer
  const baseHzRef = useRef<number | null>(null);
  const anchorAgeSecRef = useRef<number>(0);

  // Buffer for robust median on lock-in
  const bufRef = useRef<number[]>([]);

  // Logical progress (for capture logic)
  const holdSecRef = useRef<number>(0);

  // Visual progress (bar + counter) — lerps toward the logical value
  const [visualSec, setVisualSec] = useState(0);
  const visualSecRef = useRef(0);

  // Inside/outside state + grace timers
  const insideRef = useRef<boolean>(false);
  const unvoicedGapSecRef = useRef<number>(0);
  const outsideGapSecRef = useRef<number>(0);

  const completedRef = useRef(false);
  useEffect(() => { completedRef.current = completed; }, [completed]);

  /* ----------------------- tunables --------------------- */
  const HYSTERESIS_GAP = 0.5;           // inner = window*(1 - gap)
  const WARMUP_SEC = 0.15;              // brief "assume inside" after anchor
  const UNVOICED_GRACE_SEC = 0.15;
  const OUTSIDE_GRACE_SEC = 0.18;
  const REANCHOR_SILENT_SEC = 0.25;

  const FOLLOW_HZ_INSIDE = 2.0;
  const CHASE_HZ_OUTSIDE = 4.0;
  const FOLLOW_HZ_WARMUP = 6.0;

  const DECAY_RATE = 0.8;               // s of progress lost per real second
  const VISUAL_FOLLOW_RATE = 14;        // per second (bar/timer smoothing)

  /* --------------------- helpers ------------------------ */
  const hardReset = () => {
    baseHzRef.current = null;
    anchorAgeSecRef.current = 0;
    bufRef.current = [];
    holdSecRef.current = 0;
    insideRef.current = false;
    unvoicedGapSecRef.current = 0;
    outsideGapSecRef.current = 0;
    visualSecRef.current = 0;
    setVisualSec(0);
    setCapturedHz(null);
    setCompleted(false);
    setCapturedFor(null);
    completedRef.current = false;
    capturedForRef.current = null;
  };

  const moveTowards = (cur: number, tgt: number, maxDelta: number) => {
    const diff = tgt - cur;
    if (Math.abs(diff) <= maxDelta) return tgt;
    return cur + Math.sign(diff) * maxDelta;
  };

  const updateVisual = (dt: number) => {
    const sameModeComplete =
      completedRef.current && capturedForRef.current === mode;

    // During an active attempt for THIS mode, lerp toward holdSec.
    // If THIS mode is completed, pin to full target.
    const logicalTarget = sameModeComplete ? latestTargetSec.current : holdSecRef.current;

    const lerp = Math.min(1, VISUAL_FOLLOW_RATE * dt);
    let next = visualSecRef.current + (logicalTarget - visualSecRef.current) * lerp;

    // Enforce monotonic increase only while attempting THIS mode
    const enforceMonotonic = !sameModeComplete &&
      (capturedForRef.current === mode || capturedForRef.current == null);
    if (enforceMonotonic) next = Math.max(visualSecRef.current, next);

    if (sameModeComplete) next = latestTargetSec.current;

    visualSecRef.current = next;
    setVisualSec(next);
  };

  /* ----------- hard reset on mode change (fresh take) --- */
  useEffect(() => {
    // Fully clear prior completion + progress so the next note starts at 0%.
    hardReset();
    // Note: captured value is not carried over between steps by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /* ----------------------- RAF tick --------------------- */
  const tick = (ts: number) => {
    const last = lastTsRef.current ?? ts;
    const dt = Math.max(0, (ts - last) / 1000);
    lastTsRef.current = ts;

    // Always keep visual synced first
    updateVisual(dt);

    if (!latestActive.current) return;

    const sameModeComplete =
      completedRef.current && capturedForRef.current === mode;

    const voiced = latestPitch.current != null;

    // --- Unvoiced (no reliable pitch)
    if (!voiced) {
      unvoicedGapSecRef.current += dt;
      outsideGapSecRef.current = 0;

      if (unvoicedGapSecRef.current >= REANCHOR_SILENT_SEC) {
        baseHzRef.current = null;
        insideRef.current = false;
        anchorAgeSecRef.current = 0;
        bufRef.current.length = 0;
      }

      if (!sameModeComplete && unvoicedGapSecRef.current > UNVOICED_GRACE_SEC) {
        const decay = Math.min(dt * DECAY_RATE, dt);
        holdSecRef.current = Math.max(0, holdSecRef.current - decay);
      }
      return;
    }

    // --- Voiced (we have a pitch)
    unvoicedGapSecRef.current = 0;
    const hz = latestPitch.current as number;

    if (baseHzRef.current == null) {
      baseHzRef.current = hz;
      insideRef.current = true;
      anchorAgeSecRef.current = 0;
      bufRef.current.length = 0;
    } else {
      anchorAgeSecRef.current += dt;
    }

    const outerWindow = Math.max(5, latestCentsWindow.current);
    const innerWindow = Math.max(0, outerWindow * (1 - HYSTERESIS_GAP));
    const inWarmup = anchorAgeSecRef.current < WARMUP_SEC;

    const centsNow = baseHzRef.current ? centsBetweenHz(hz, baseHzRef.current) : 0;

    let isInside = true;
    if (!inWarmup) {
      const wasInside = insideRef.current;
      isInside = wasInside ? Math.abs(centsNow) <= outerWindow : Math.abs(centsNow) <= innerWindow;
    }
    insideRef.current = inWarmup ? true : isInside;

    const rate =
      inWarmup ? FOLLOW_HZ_WARMUP :
      (insideRef.current ? FOLLOW_HZ_INSIDE : CHASE_HZ_OUTSIDE);
    baseHzRef.current = moveTowards(baseHzRef.current as number, hz, rate * dt);

    if (!sameModeComplete) {
      // Optional: quick re-anchor on big leaps before progress builds up
      if (holdSecRef.current < 0.1) {
        const centsJump = Math.abs(centsBetweenHz(hz, baseHzRef.current as number));
        if (centsJump > Math.max(300, latestCentsWindow.current * 3)) {
          baseHzRef.current = hz;
          insideRef.current = true;
          anchorAgeSecRef.current = 0;
          bufRef.current.length = 0;
        }
      }

      if (insideRef.current) {
        outsideGapSecRef.current = 0;
        holdSecRef.current = Math.min(latestTargetSec.current, holdSecRef.current + dt);
        bufRef.current.push(hz);
        const maxBuf = Math.max(30, Math.min(120, Math.round(60 * 1.2)));
        if (bufRef.current.length > maxBuf) bufRef.current.shift();
      } else {
        outsideGapSecRef.current += dt;

        if (holdSecRef.current <= 0.05 && outsideGapSecRef.current >= 0.15) {
          // quick re-anchor at the start of a hold if they drifted before progress built up
          baseHzRef.current = hz;
          insideRef.current = true;
          anchorAgeSecRef.current = 0;
          bufRef.current.length = 0;
        } else if (outsideGapSecRef.current > OUTSIDE_GRACE_SEC) {
          const decay = Math.min(dt * DECAY_RATE, dt);
          holdSecRef.current = Math.max(0, holdSecRef.current - decay);
          if (bufRef.current.length > 0) bufRef.current.shift();
        }
      }
    }

    // Reached target? Capture for THIS mode
    if (!sameModeComplete && holdSecRef.current >= latestTargetSec.current) {
      const sorted = [...bufRef.current].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] ?? hz;

      setCapturedHz(med);
      setCompleted(true);
      setCapturedFor(mode);
      completedRef.current = true;
      capturedForRef.current = mode;

      // Pin logical & visual at full to avoid any backslide.
      holdSecRef.current = latestTargetSec.current;
      visualSecRef.current = latestTargetSec.current;
      setVisualSec(latestTargetSec.current);
    }
  };

  /* ------------------ start/stop RAF loop ---------------- */
  useEffect(() => {
    lastTsRef.current = null;

    if (!active) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const step = (ts: number) => {
      tick(ts);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------ UI -------------------------- */
  const title =
    mode === "low"
      ? "Step 1 — Sing your lowest comfortable note"
      : "Step 2 — Sing your highest comfortable note";

  const sub =
    typeof holdSec === "number" && isFinite(holdSec) && holdSec > 0
      ? `Hold it steadily for ${holdSec.toFixed(0)} second${holdSec === 1 ? "" : "s"}.`
      : `Hold it steadily for ${beatsRequired} beat${beatsRequired === 1 ? "" : "s"} (≈${targetSec.toFixed(1)} second${targetSec === 1 ? "" : "s"}).`;

  // Use visualSec for both bar and counter
  const progressPct = Math.max(0, Math.min(100, (visualSec / targetSec) * 100));

  // Only show a capture if it belongs to THIS mode
  const effectiveCapturedHz = capturedFor === mode ? capturedHz : null;

  const display =
    effectiveCapturedHz != null
      ? (() => {
          const n = hzToNoteName(effectiveCapturedHz, a4Hz, { useSharps: true, octaveAnchor: "A" });
          const dispOct = n.octave;
          return `${n.name}${dispOct} • ${effectiveCapturedHz.toFixed(1)} Hz`;
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

      {/* Progress bar (we animate per frame) */}
      <div className="mt-4">
        <div className="h-2 w-full bg-[#dcdcdc] rounded overflow-hidden">
          <div className="h-full bg-[#0f0f0f]" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mt-2 text-sm text-[#2d2d2d]">
          Hold progress: <span className="font-mono">{visualSec.toFixed(2)}s</span> /{" "}
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
          <button
            type="button"
            onClick={hardReset}
            className="px-4 h-11 rounded-md bg-[#ebebeb] border border-[#d2d2d2] text-[#0f0f0f] hover:opacity-90 active:scale-[0.98]"
          >
            Try Again
          </button>
          {completed && capturedFor === mode && (
            <button
              type="button"
              onClick={() => effectiveCapturedHz != null && onConfirm(effectiveCapturedHz)}
              className="px-4 h-11 rounded-md bg-[#0f0f0f] text-[#f0f0f0] font-medium transition duration-200 hover:opacity-90 active:scale-[0.98]"
            >
              {mode === "low" ? "Confirm Low Note" : "Confirm High Note"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
