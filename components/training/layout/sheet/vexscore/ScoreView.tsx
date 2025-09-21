// components/training/layout/sheet/vexscore/ScoreView.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Renderer } from "vexflow";
import { pickClef, keyAccidentals } from "./builders";
import { computeSystems, EST_STAVE_H, SYSTEM_GAP_Y, STAFF_GAP_Y } from "./layout";
import { useResizeObserver } from "./useResizeObserver";
import { buildMelodyTickables, buildRhythmTickables } from "./makeTickables";
import { drawSystem } from "./drawSystem";
import type { VexScoreProps, SystemLayout } from "./types";
import { noteValueToSeconds } from "@/utils/time/tempo";

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
  rhythm,
  melodyRhythm,
  onLayout,
  className,
  keySig = null,
}: VexScoreProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const hasDrawnOnceRef = useRef<boolean>(false);
  const dims = useResizeObserver(hostRef as any, 120, heightPx);

  const clef = clefProp ?? pickClef(phrase);

  // timing helpers
  const secPerBeat = useMemo(() => (60 / Math.max(1, bpm)) * (4 / Math.max(1, den)), [bpm, den]);
  const secPerBar = useMemo(() => tsNum * secPerBeat, [tsNum, secPerBeat]);
  // whole-notes per second (for seconds→tokens conversions)
  const wnPerSec = useMemo(() => bpm / (60 * Math.max(1, den)), [bpm, den]);

  const contentSec = useMemo(() => {
    const fromPhrase = Math.max(0, phrase?.durationSec ?? 0);
    const fromMelodyRhy =
      Array.isArray(melodyRhythm) && melodyRhythm.length
        ? melodyRhythm.reduce((s, ev) => s + noteValueToSeconds(ev.value, bpm, den), 0)
        : 0;
    return Math.max(fromPhrase, fromMelodyRhy);
  }, [phrase?.durationSec, melodyRhythm, bpm, den]);

  // Total length = ceil((lead-in + content) to whole bars) — used only for page/system planning
  const totalSec = useMemo(() => {
    const raw = Math.max(leadInSec + contentSec, 1e-6);
    return Math.ceil(raw / Math.max(1e-9, secPerBar)) * secPerBar;
  }, [leadInSec, contentSec, secPerBar]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !dims.w) return;

    if (!hasDrawnOnceRef.current) el.style.visibility = "hidden";

    const ensureVexFonts = async () => {
      if (typeof document !== "undefined" && (document as any).fonts) {
        try {
          await Promise.race([
            (document as any).fonts.ready,
            Promise.allSettled([
              (document as any).fonts.load('12px "Bravura"'),
              (document as any).fonts.load('12px "Gonville"'),
              (document as any).fonts.load('12px "Petaluma"'),
              (document as any).fonts.load('12px "Arial"'),
            ]),
          ]);
        } catch { /* noop */ }
      }
    };

    let cancelled = false;

    (async () => {
      await ensureVexFonts();
      if (cancelled) return;

      const keyMap = keyAccidentals(keySig || null);

      // Build tickables using tick-accurate bar math (den-aware)
      const mel = buildMelodyTickables({
        phrase,
        clef,
        useSharps,
        leadInSec,
        wnPerSec,
        secPerWholeNote: 1 / Math.max(1e-9, wnPerSec),
        secPerBar,
        tsNum,
        den, // ✅ denominator-aware bars
        lyrics,
        rhythm: melodyRhythm,
        keyAccidentals: keySig ? keyMap : null,
      });

      const rhy = buildRhythmTickables({
        rhythm,
        leadInSec,
        wnPerSec,
        secPerWholeNote: 1 / Math.max(1e-9, wnPerSec),
        secPerBar,
        tsNum,
        den, // ✅
      });

      const haveRhythm = Array.isArray(rhythm) && rhythm.length > 0;

      // bars-per-row from first line density, then lock
      const { systems, barsPerRow } = computeSystems(totalSec, secPerBar, {
        melodyStarts: mel.starts,
        maxBarsPerRow: 4,
      });

      // renderer + canvas
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

      systems.forEach((meta, idx) => {
        const isLastSystem = idx === systems.length - 1;

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
          barsPerRow,
          keySig,
          isLastSystem,
        });

        layouts.push(layout);
        currentY = nextY + SYSTEM_GAP_Y;
      });

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

      const svg = el.querySelector("svg") as SVGSVGElement | null;
      if (svg) {
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.style.display = "block";
        svg.style.width = "100%";
        svg.style.height = "100%";
      }

      hasDrawnOnceRef.current = true;
      el.style.visibility = "visible";
    })();

    return () => {
      cancelled = true;
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
    clef,
    onLayout,
    contentSec,
    keySig,
  ]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: "relative", width: "100%", height: heightPx ? `${heightPx}px` : "100%" }}
    />
  );
}
