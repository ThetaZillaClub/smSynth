// components/training/layout/sheet/vexscore/ScoreView.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Renderer } from "vexflow";
import { pickClef } from "./builders";
import { computeSystems, EST_STAVE_H, SYSTEM_GAP_Y, STAFF_GAP_Y } from "./layout";
import { useResizeObserver } from "./useResizeObserver";
import { buildMelodyTickables, buildRhythmTickables } from "./makeTickables";
import { drawSystem } from "./drawSystem";
import type { VexScoreProps, SystemLayout } from "./types";

export default function ScoreView({
  phrase,
  lyrics,
  bpm = 80,
  den = 4,
  tsNum = 4,
  heightPx,
  leadInSec = 0,
  useSharps = true,
  clef: clefProp,
  rhythm,          // blue staff (optional)
  melodyRhythm,    // authoritative rhythm for melody (optional)
  onLayout,
  className,
}: VexScoreProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dims = useResizeObserver(hostRef as any, 120, heightPx);

  const clef = clefProp ?? pickClef(phrase);
  const wnPerSec = useMemo(() => bpm / (60 * den), [bpm, den]);
  const secPerBeat = useMemo(() => (60 / Math.max(1, bpm)) * (4 / Math.max(1, den)), [bpm, den]);
  const secPerBar = useMemo(() => tsNum * secPerBeat, [tsNum, secPerBeat]);
  const totalSec = useMemo(
    () => Math.max(leadInSec + (phrase?.durationSec ?? 0), 1e-3),
    [leadInSec, phrase?.durationSec]
  );
  const secPerWholeNote = useMemo(() => 1 / Math.max(1e-9, wnPerSec), [wnPerSec]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !dims.w) return;

    // build once (whole piece)
    const mel = buildMelodyTickables({
      phrase,
      clef,
      useSharps,
      leadInSec,
      wnPerSec,
      secPerWholeNote,
      secPerBeat,
      lyrics,
      // IMPORTANT: melody rhythm is independent from the visible blue rhythm staff.
      rhythm: melodyRhythm,
    });
    const rhy = buildRhythmTickables({ rhythm, leadInSec, wnPerSec, secPerWholeNote });
    const haveRhythm = Array.isArray(rhythm) && rhythm.length > 0;

    const systems = computeSystems(totalSec, secPerBar);

    // renderer + canvas size estimate
    el.innerHTML = "";
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    const systemCount = systems.length;
    const stavesPerSystem = haveRhythm ? 2 : 1;
    const estimatedH =
      10 +
      systemCount * (stavesPerSystem * EST_STAVE_H + (haveRhythm ? STAFF_GAP_Y : 0)) +
      (systemCount - 1) * SYSTEM_GAP_Y +
      10;
    const totalH = Math.max(dims.h, estimatedH);
    renderer.resize(dims.w, totalH);
    const ctx = renderer.getContext();

    const padding = { left: 12, right: 12, top: 10, bottom: 10 } as const;
    const staffWidth = Math.max(50, dims.w - padding.left - padding.right);

    const layouts: SystemLayout[] = [];
    let currentY = padding.top;

    systems.forEach((meta, sIdx) => {
      const { layout, nextY } = drawSystem({
        ctx,
        padding,
        currentY,
        staffWidth,
        tsNum,
        den,
        clef,
        haveRhythm,
        systemWindow: {
          startSec: meta.startSec,
          endSec: meta.endSec,
          contentEndSec: meta.contentEndSec,
        },
        mel,
        rhy,
        secPerBar,
      });

      // legacy one-row callback (first row)
      if (sIdx === 0 && onLayout) onLayout({ noteStartX: layout.x0, noteEndX: layout.x1 });

      layouts.push(layout);
      currentY = nextY + SYSTEM_GAP_Y;
    });

    // multi-row overlay payload
    if (onLayout && layouts.length) {
      const total = {
        startSec: 0,
        endSec: systems.length ? systems[systems.length - 1].endSec : totalSec,
        x0: layouts[0].x0,
        x1: layouts[layouts.length - 1].x1,
        y0: layouts[0].y0,
        y1: layouts[layouts.length - 1].y1,
      };
      onLayout({ systems: layouts, total });
    }

    // polish SVG
    const svg = el.querySelector("svg") as SVGSVGElement | null;
    if (svg) {
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.style.display = "block";
      svg.style.width = "100%";
      svg.style.height = "100%";
    }

    return () => {
      el.innerHTML = "";
    };
  }, [
    phrase,
    lyrics,
    rhythm,
    melodyRhythm,
    bpm,
    den,
    tsNum,
    leadInSec,
    useSharps,
    dims,
    secPerBeat,
    secPerBar,
    totalSec,
    wnPerSec,
    secPerWholeNote,
    clef,
    onLayout,
  ]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: "relative", width: "100%", height: heightPx ? `${heightPx}px` : "100%" }}
    />
  );
}
