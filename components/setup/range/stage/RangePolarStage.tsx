// components/setup/range/stage/RangePolarStage.tsx
"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import RangeCenterBadge from "./RangeCenterBadge";
import { hzToMidi, midiToNoteName, centsBetweenHz } from "@/utils/pitch/pitchMath";

type Props = {
  mode: "low" | "high";
  /** when true, we actively capture/advance progress; when false, only show live label */
  active: boolean;
  /** live pitch is always shown as the center label even when not capturing */
  pitchHz: number | null | undefined;
  holdSec?: number;               // seconds to “fill”
  centsWindow?: number;           // stability window
  a4Hz?: number;                  // default 440
  resetKey?: number;              // bump to hard reset internals

  onProgress?: (progress01: number) => void;               // 0..1
  onCaptured?: (capturedHz: number, label: string) => void; // once per capture
};

// ---- sizing knobs -----------------------------------------------------------
// Base “fractions” that kept layout safe before:
const WIDTH_FRACTION_BASE = 0.92;
const HEIGHT_FRACTION_BASE = 0.78;

// Apply a 250% increase to the *base percent* without letting it exceed the container.
// Practically, this bumps the fractions up to 1.0 (fill), but never beyond.
const PERCENT_INCREASE = 2.5; // “250% increase of base percent”
const WIDTH_FRACTION = Math.min(1, WIDTH_FRACTION_BASE * PERCENT_INCREASE);
const HEIGHT_FRACTION = Math.min(1, HEIGHT_FRACTION_BASE * PERCENT_INCREASE);

// Visual clamps (feel free to nudge)
const MIN_STAGE_PX = 180;   // lower bound for tiny screens
const MAX_STAGE_PX = 680;   // allow a larger ring on roomy layouts

export default function RangePolarStage({
  mode,
  active,
  pitchHz,
  holdSec = 1,
  centsWindow = 75,
  a4Hz = 440,
  resetKey,
  onProgress,
  onCaptured,
}: Props) {
  // ---------- size ----------
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<number>(Math.min(MAX_STAGE_PX, 260));

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const measure = () => {
      // Prefer client* (no forced layout), fall back to rect.
      let w = el.clientWidth;
      let h = el.clientHeight;
      if (!w || !h) {
        const rect = el.getBoundingClientRect();
        w ||= Math.round(rect.width);
        h ||= Math.round(rect.height);
      }
      if (!w || !h) return; // ignore transient zeros

      // Compute an ideal square size from the *increased* fractions,
      // but never exceed the container's smaller dimension.
      const ideal = Math.min(
        Math.floor(w * WIDTH_FRACTION),
        Math.floor(h * HEIGHT_FRACTION)
      );
      const parentLimit = Math.floor(Math.min(w, h));
      const clamped = Math.max(MIN_STAGE_PX, Math.min(MAX_STAGE_PX, ideal, parentLimit));
      setSize(clamped);
    };

    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------- internal capture state ----------
  const [capturedHz, setCapturedHz] = useState<number | null>(null);
  const [capturedFor, setCapturedFor] = useState<"low" | "high" | null>(null);
  const completedRef = useRef(false);

  const baseHzRef = useRef<number | null>(null);
  const anchorAgeSecRef = useRef(0);
  const insideRef = useRef(false);
  const unvoicedGapSecRef = useRef(0);
  const outsideGapSecRef = useRef(0);
  const holdSecRef = useRef(0);
  const bufRef = useRef<number[]>([]);
  const visualSecRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const latest = useRef({
    active,
    pitchHz: typeof pitchHz === "number" ? pitchHz : null,
    centsWindow,
    targetSec: Math.max(0.1, holdSec),
  });
  useLayoutEffect(() => { latest.current.active = active; }, [active]);
  useLayoutEffect(() => { latest.current.pitchHz = (typeof pitchHz === "number" ? pitchHz : null); }, [pitchHz]);
  useLayoutEffect(() => { latest.current.centsWindow = centsWindow; }, [centsWindow]);
  useLayoutEffect(() => { latest.current.targetSec = Math.max(0.1, holdSec); }, [holdSec]);

  const hardReset = () => {
    setCapturedHz(null);
    setCapturedFor(null);
    completedRef.current = false;
    baseHzRef.current = null;
    anchorAgeSecRef.current = 0;
    insideRef.current = false;
    unvoicedGapSecRef.current = 0;
    outsideGapSecRef.current = 0;
    holdSecRef.current = 0;
    bufRef.current = [];
    visualSecRef.current = 0;
    onProgress?.(0);
  };

  // Reset on mode / external reset
  useEffect(() => { hardReset(); }, [mode, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // If capture toggles OFF, clear progress immediately (keep live label preview)
  useEffect(() => {
    if (!active) {
      holdSecRef.current = 0;
      visualSecRef.current = 0;
      onProgress?.(0);
    }
  }, [active, onProgress]);

  // constants (engine feel)
  const HYSTERESIS_GAP = 0.5;
  const WARMUP_SEC = 0.15;
  const UNVOICED_GRACE_SEC = 0.15;
  const OUTSIDE_GRACE_SEC = 0.18;
  const REANCHOR_SILENT_SEC = 0.25;
  const FOLLOW_HZ_INSIDE = 2.0;
  const CHASE_HZ_OUTSIDE = 4.0;
  const FOLLOW_HZ_WARMUP = 6.0;
  const DECAY_RATE = 0.8;
  const VISUAL_FOLLOW_RATE = 14;

  const moveTowards = (cur: number, tgt: number, maxDelta: number) => {
    const diff = tgt - cur;
    if (Math.abs(diff) <= maxDelta) return tgt;
    return cur + Math.sign(diff) * maxDelta;
  };

  const updateVisual = (dt: number) => {
    const sameModeComplete = completedRef.current && capturedFor === mode;
    const logicalTarget = sameModeComplete ? latest.current.targetSec : holdSecRef.current;

    // Ease toward target up *and* down (so ring drops when you stop singing)
    const lerp = Math.min(1, VISUAL_FOLLOW_RATE * dt);
    const next = visualSecRef.current + (logicalTarget - visualSecRef.current) * lerp;

    visualSecRef.current = next;
    const p01 = Math.max(0, Math.min(1, next / Math.max(0.001, latest.current.targetSec)));
    onProgress?.(p01);
  };

  const tick = (ts: number) => {
    const last = lastTsRef.current ?? ts;
    const dt = Math.max(0, (ts - last) / 1000);
    lastTsRef.current = ts;

    updateVisual(dt);

    if (!latest.current.active) return;
    const voiced = latest.current.pitchHz != null;
    const sameModeComplete = completedRef.current && capturedFor === mode;

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

    // got pitch
    unvoicedGapSecRef.current = 0;
    const hz = latest.current.pitchHz as number;

    if (baseHzRef.current == null) {
      baseHzRef.current = hz;
      insideRef.current = true;
      anchorAgeSecRef.current = 0;
      bufRef.current.length = 0;
    } else {
      anchorAgeSecRef.current += dt;
    }

    const outerWindow = Math.max(5, latest.current.centsWindow);
    const innerWindow = Math.max(0, outerWindow * (1 - HYSTERESIS_GAP));
    const inWarmup = anchorAgeSecRef.current < WARMUP_SEC;

    const centsNow = baseHzRef.current ? centsBetweenHz(hz, baseHzRef.current) : 0;

    let isInside = true;
    if (!inWarmup) {
      const wasInside = insideRef.current;
      isInside = wasInside ? Math.abs(centsNow) <= outerWindow : Math.abs(centsNow) <= innerWindow;
    }
    insideRef.current = inWarmup ? true : isInside;

    const rate = inWarmup ? FOLLOW_HZ_WARMUP : (insideRef.current ? FOLLOW_HZ_INSIDE : CHASE_HZ_OUTSIDE);
    baseHzRef.current = moveTowards(baseHzRef.current as number, hz, rate * dt);

    if (!sameModeComplete) {
      if (holdSecRef.current < 0.1) {
        const centsJump = Math.abs(centsBetweenHz(hz, baseHzRef.current as number));
        if (centsJump > Math.max(300, latest.current.centsWindow * 3)) {
          baseHzRef.current = hz;
          insideRef.current = true;
          anchorAgeSecRef.current = 0;
          bufRef.current.length = 0;
        }
      }

      if (insideRef.current) {
        outsideGapSecRef.current = 0;
        holdSecRef.current = Math.min(latest.current.targetSec, holdSecRef.current + dt);
        bufRef.current.push(hz);
        const maxBuf = Math.max(30, Math.min(120, Math.round(60 * 1.2)));
        if (bufRef.current.length > maxBuf) bufRef.current.shift();
      } else {
        outsideGapSecRef.current += dt;

        if (holdSecRef.current <= 0.05 && outsideGapSecRef.current >= 0.15) {
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

    // complete capture
    if (!sameModeComplete && holdSecRef.current >= latest.current.targetSec) {
      const sorted = [...bufRef.current].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] ?? hz;
      setCapturedHz(med);
      setCapturedFor(mode);
      completedRef.current = true;
      holdSecRef.current = latest.current.targetSec;
      visualSecRef.current = latest.current.targetSec;

      const m = Math.round(hzToMidi(med, a4Hz));
      const n = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
      const label = `${n.name}${n.octave}`;
      try { onCaptured?.(med, label); } catch {}
    }
  };

  useEffect(() => {
    lastTsRef.current = null;
    // Keep animating only while active (when inactive, we show a static ring at 0)
    if (!active) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const loop = (ts: number) => {
      tick(ts);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- labels + render ----------
  const liveLabel = (() => {
    const hz = latest.current.pitchHz;
    if (hz == null) return "—";
    const m = Math.round(hzToMidi(hz, a4Hz));
    const n = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
    return `${n.name}${n.octave}`;
  })();

  const primary = capturedHz != null
    ? (() => {
        const m = Math.round(hzToMidi(capturedHz, a4Hz));
        const n = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
        return `${n.name}${n.octave}`;
      })()
    : liveLabel;

  const cx = size / 2, cy = size / 2;
  const centerR = Math.max(24, Math.floor(size * 0.18));

  // Fit SVG to container in both axes
  return (
    <div
      ref={hostRef}
      className="relative w-full h-full flex items-center justify-center"
    >
      <svg
        width="150%"
        height="150%"
        viewBox={`0 0 ${size} ${size}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Range capture"
      >
        <g>
          <RangeCenterBadge
            cx={cx}
            cy={cy}
            r={centerR}
            primary={primary}
            progress01={
              completedRef.current
                ? 1
                : Math.max(
                    0,
                    Math.min(1, visualSecRef.current / Math.max(0.001, latest.current.targetSec))
                  )
            }
          />
        </g>
      </svg>
    </div>
  );
}
