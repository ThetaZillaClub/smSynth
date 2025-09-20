// components/training/layout/sheet/vexscore/ScoreView.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Renderer, Stave, StaveConnector, StaveNote, Voice, Formatter,
  Accidental, Dot, Tuplet, Annotation,
  AnnotationHorizontalJustify as AHJ,
  AnnotationVerticalJustify as AVJ,
} from "vexflow";
import type { Phrase } from "@/utils/piano-roll/scale";
import type { RhythmEvent } from "@/utils/phrase/generator";
import type { NoteValue } from "@/utils/time/tempo";

import {
  pickClef, midiToVexKey, tokToDuration, secondsToTokens, tokToSeconds,
  mapNoteValue, buildBeams, type Tok
} from "./builders";

/** layout constants (kept local for simplicity) */
const BARS_PER_ROW = 4;
const STAFF_GAP_Y  = 14;
const SYSTEM_GAP_Y = 28;
const EST_STAVE_H  = 80;

export type SystemLayout = {
  startSec: number; endSec: number;
  x0: number; x1: number;
  y0: number; y1: number;
};

export type VexScoreProps = {
  phrase: Phrase;
  lyrics?: string[];
  bpm?: number;
  den?: number;
  tsNum?: number;
  heightPx?: number;
  leadInSec?: number;
  useSharps?: boolean;
  clef?: "treble" | "bass";
  rhythm?: RhythmEvent[];
  onLayout?: (
    m:
      | { noteStartX: number; noteEndX: number }
      | { systems: SystemLayout[]; total: { startSec: number; endSec: number; x0: number; x1: number; y0: number; y1: number } }
  ) => void;
  className?: string;
};

function makeRest(duration: string, clef: "treble" | "bass") {
  const key = clef === "treble" ? "b/4" : "d/3";
  return new StaveNote({ keys: [key], duration: (duration + "r") as any, clef, autoStem: true });
}

/** ALWAYS build systems that are exactly 4 bars wide (uniform layout) */
function computeSystems(totalSec: number, secPerBar: number) {
  const totalBarsFloat = totalSec / secPerBar;
  const totalBarsCeil = Math.ceil(totalBarsFloat - 1e-9);

  const out: Array<{
    startBar: number;
    endBar: number;           // fixed = startBar + 4
    startSec: number;         // fixed timespan for this row (4 bars)
    endSec: number;           // startSec + 4 * secPerBar
    contentEndSec: number;    // real content end falling in this row
  }> = [];

  for (let b = 0; b < totalBarsCeil; b += BARS_PER_ROW) {
    const startBar = b;
    const endBar = startBar + BARS_PER_ROW;
    const startSec = startBar * secPerBar;
    const endSec = startSec + BARS_PER_ROW * secPerBar; // fixed width
    const realEndBar = Math.min(totalBarsCeil, endBar);
    const contentEndSec = Math.min(totalSec, realEndBar * secPerBar);
    out.push({ startBar, endBar, startSec, endSec, contentEndSec });
  }

  if (out.length === 0) {
    out.push({
      startBar: 0,
      endBar: BARS_PER_ROW,
      startSec: 0,
      endSec: BARS_PER_ROW * secPerBar,
      contentEndSec: totalSec,
    });
  }
  return out;
}

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
  onLayout,
  className,
}: VexScoreProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: heightPx ?? 200 });

  // responsive sizing
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(1, el.clientWidth || Math.round(el.getBoundingClientRect().width));
      const h = heightPx ?? Math.max(120, el.clientHeight || Math.round(el.getBoundingClientRect().height) || 200);
      setDims((p) => (p.w !== w || p.h !== h ? { w, h } : p));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [heightPx]);

  const clef = clefProp ?? pickClef(phrase);
  const wnPerSec = useMemo(() => bpm / (60 * den), [bpm, den]); // whole-notes per second
  const secPerBeat = useMemo(() => (60 / Math.max(1, bpm)) * (4 / Math.max(1, den)), [bpm, den]);
  const secPerBar  = useMemo(() => tsNum * secPerBeat, [tsNum, secPerBeat]);
  const totalSec   = useMemo(() => Math.max(leadInSec + (phrase?.durationSec ?? 0), 1e-3), [leadInSec, phrase?.durationSec]);
  const secPerWholeNote = useMemo(() => 1 / Math.max(1e-9, wnPerSec), [wnPerSec]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !dims.w) return;

    // ---- Systems (rows) ----
    const systems = computeSystems(totalSec, secPerBar);
    const haveRhythm = Array.isArray(rhythm) && rhythm.length > 0;

    // ---- Build MEL (absolute starts) ----
    const melTicks: any[] = [];
    const melStarts: number[] = [];
    let tMel = 0;

    const barsExact = Math.round(leadInSec / secPerBar);
    const isBarMultiple = Math.abs(leadInSec - barsExact * secPerBar) < 1e-4;

    if (leadInSec > 1e-6) {
      if (isBarMultiple && barsExact >= 1) {
        for (let i = 0; i < barsExact; i++) {
          const r = makeRest("w", clef);
          melTicks.push(r);
          melStarts.push(tMel);
          tMel += 4 * secPerBeat;
        }
      } else {
        for (const tok of secondsToTokens(leadInSec, wnPerSec)) {
          const r = makeRest(tokToDuration(tok), clef);
          if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
          melTicks.push(r); melStarts.push(tMel);
          tMel += tokToSeconds(tok, secPerWholeNote);
        }
      }
    }

    const notes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
    if (!notes.length) {
      const r = makeRest("w", clef);
      melTicks.push(r); melStarts.push(tMel);
      tMel += 4 * secPerBeat;
    } else {
      let lyricIndex = 0;
      const tol = 1e-4;
      for (const n of notes) {
        const gap = n.startSec - tMel;
        if (gap > tol) {
          for (const tok of secondsToTokens(gap, wnPerSec)) {
            const rn = makeRest(tokToDuration(tok), clef);
            if (tok.dots) Dot.buildAndAttach([rn as any], { all: true });
            melTicks.push(rn); melStarts.push(tMel);
            tMel += tokToSeconds(tok, secPerWholeNote);
          }
        }

        const toks = secondsToTokens(n.durSec, wnPerSec);
        const { key, accidental } = midiToVexKey(n.midi, useSharps);
        toks.forEach((tok, idx) => {
          const sn = new StaveNote({ keys: [key], duration: tokToDuration(tok), clef, autoStem: true });
          if (accidental) sn.addModifier(new Accidental(accidental), 0);
          if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });

          if (idx === 0 && lyrics && lyrics[lyricIndex]) {
            const ann = new Annotation(lyrics[lyricIndex])
              .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
              .setVerticalJustification(AVJ.BOTTOM)
              .setJustification(AHJ.CENTER);
            sn.addModifier(ann, 0);
          }

          melTicks.push(sn); melStarts.push(tMel);
          tMel += tokToSeconds(tok, secPerWholeNote);
        });

        lyricIndex++;
      }
    }

    // ---- Build RHY (absolute starts) ----
    const rhyTicks: any[] = [];
    const rhyStarts: number[] = [];
    const tuplets: Tuplet[] = [];
    let tRhy = 0;

    if (haveRhythm) {
      if (leadInSec > 1e-6) {
        for (const tok of secondsToTokens(leadInSec, wnPerSec)) {
          const r = makeRest(tokToDuration(tok), "bass");
          if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
          rhyTicks.push(r); rhyStarts.push(tRhy);
          tRhy += tokToSeconds(tok, secPerWholeNote);
        }
      }

      let tripletBuf: { base: Tok["dur"]; note: StaveNote }[] = [];
      const flushTriplets = () => {
        for (let i = 0; i + 2 < tripletBuf.length; i += 3) {
          const a = tripletBuf[i], b = tripletBuf[i + 1], c = tripletBuf[i + 2];
          if (a.base === b.base && b.base === c.base) tuplets.push(new Tuplet([a.note, b.note, c.note] as any));
        }
        tripletBuf = [];
      };

      for (const ev of (rhythm as RhythmEvent[])) {
        const { tok, triplet } = mapNoteValue(ev.value as NoteValue);
        const dur = tokToDuration(tok);
        const tokSec = tokToSeconds(tok, secPerWholeNote);

        if (ev.type === "rest") {
          const rn = makeRest(dur, "bass");
          if (tok.dots) Dot.buildAndAttach([rn as any], { all: true });
          rhyTicks.push(rn); rhyStarts.push(tRhy);
          tRhy += tokSec; flushTriplets();
        } else {
          const sn = new StaveNote({ keys: ["d/3"], duration: dur, clef: "bass", autoStem: true });
          if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });
          rhyTicks.push(sn); rhyStarts.push(tRhy);
          tRhy += tokSec;

          if (triplet) {
            tripletBuf.push({ base: tok.dur, note: sn });
            if (tripletBuf.length === 3) flushTriplets();
          } else flushTriplets();
        }
      }
      flushTriplets();
    }

    // ---- Render ----
    el.innerHTML = "";
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    const systemCount = systems.length;
    const stavesPerSystem = haveRhythm ? 2 : 1;
    const estimatedH =
      10 + systemCount * (stavesPerSystem * EST_STAVE_H + (haveRhythm ? STAFF_GAP_Y : 0)) +
      (systemCount - 1) * SYSTEM_GAP_Y + 10;

    const totalH = Math.max(dims.h, estimatedH);
    renderer.resize(dims.w, totalH);
    const ctx = renderer.getContext();

    const padding = { left: 12, right: 12, top: 10, bottom: 10 } as const;
    const staffWidth = Math.max(50, dims.w - padding.left - padding.right);

    const layouts: SystemLayout[] = [];
    let currentY = padding.top;

    for (let s = 0; s < systems.length; s++) {
      const meta = systems[s];
      // FIXED four-bar duration for every row
      const sysDur = Math.max(1e-6, meta.endSec - meta.startSec);

      // staves
      const melStave = new Stave(padding.left, currentY, staffWidth);
      melStave.setClef(clef);
      melStave.addTimeSignature(`${tsNum}/${den}`);
      melStave.setContext(ctx).draw();

      let rhyStave: Stave | null = null;
      if (haveRhythm) {
        const yR = melStave.getBottomY() + STAFF_GAP_Y;
        rhyStave = new Stave(padding.left, yR, staffWidth);
        rhyStave.setClef("bass");
        rhyStave.addTimeSignature(`${tsNum}/${den}`);
        rhyStave.setContext(ctx).draw();

        new StaveConnector(melStave, rhyStave).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
        new StaveConnector(melStave, rhyStave).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
        new StaveConnector(melStave, rhyStave).setType(StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
      }

      // filter tickables for this row's REAL content window
      const selMel: any[] = [], selMelT0: number[] = [];
      for (let i = 0; i < melTicks.length; i++) {
        const t0 = melStarts[i];
        if (t0 >= meta.startSec && t0 < meta.contentEndSec) { selMel.push(melTicks[i]); selMelT0.push(t0); }
      }
      const selRhy: any[] = [], selRhyT0: number[] = [];
      if (haveRhythm && rhyStave) {
        for (let i = 0; i < rhyTicks.length; i++) {
          const t0 = rhyStarts[i];
          if (t0 >= meta.startSec && t0 < meta.contentEndSec) { selRhy.push(rhyTicks[i]); selRhyT0.push(t0); }
        }
      }

      // voices + layout
      const melVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
      melVoice.addTickables(selMel as any);
      new Formatter({ softmaxFactor: 5 }).joinVoices([melVoice]).formatToStave([melVoice], melStave);

      let rhyVoice: Voice | null = null;
      if (haveRhythm && rhyStave) {
        rhyVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
        rhyVoice.addTickables(selRhy as any);
        new Formatter({ softmaxFactor: 5 }).joinVoices([rhyVoice]).formatToStave([rhyVoice], rhyStave);
      }

      // time → x mapping across the FULL fixed four-bar span
      const noteStartX = typeof (melStave as any).getNoteStartX === "function"
        ? (melStave as any).getNoteStartX()
        : melStave.getX() + 48;
      const noteEndX = typeof (melStave as any).getNoteEndX === "function"
        ? (melStave as any).getNoteEndX()
        : melStave.getX() + melStave.getWidth() - 12;
      const bandW = Math.max(1, noteEndX - noteStartX);
      const xAt = (t0: number) => noteStartX + ((t0 - meta.startSec) / sysDur) * bandW;

      // legacy layout (first system only)
      if (s === 0 && onLayout) onLayout({ noteStartX, noteEndX });

      // pin tickcontexts strictly to time
      for (let i = 0; i < selMel.length; i++) {
        const tc = (selMel[i] as any).getTickContext?.();
        if (tc && typeof tc.setX === "function") tc.setX(xAt(selMelT0[i] ?? meta.startSec));
      }
      if (haveRhythm && rhyVoice && rhyStave) {
        for (let i = 0; i < selRhy.length; i++) {
          const tc = (selRhy[i] as any).getTickContext?.();
          if (tc && typeof tc.setX === "function") tc.setX(xAt(selRhyT0[i] ?? meta.startSec));
        }
      }

      // draw
      melVoice.draw(ctx, melStave);
      buildBeams(selMel).forEach((b) => b.setContext(ctx).draw());
      if (haveRhythm && rhyVoice && rhyStave) {
        rhyVoice.draw(ctx, rhyStave);
        buildBeams(selRhy).forEach((b) => b.setContext(ctx).draw());
      }

      // barlines (no labels): ALWAYS 4 equal segments per row
      const staffTopY = melStave.getYForLine(0) - 6;
      const staffBottomY = (haveRhythm && rhyStave ? rhyStave : melStave).getYForLine(4) + 6;
      const drawBarAtX = (x: number) => {
        const xi = Math.round(x);
        ctx.beginPath();
        ctx.moveTo(xi, staffTopY);
        ctx.lineTo(xi, staffBottomY);
        ctx.setLineWidth(1);
        ctx.setStrokeStyle("rgba(15,15,15,0.5)");
        ctx.stroke();
      };

      // left barline
      drawBarAtX(noteStartX);

      // interior barlines at 1/4, 2/4, 3/4 of the band
      for (let k = 1; k < BARS_PER_ROW; k++) {
        const u = k / BARS_PER_ROW;
        const x = noteStartX + u * bandW;
        drawBarAtX(x);
      }

      // right barline (end of the 4th bar)
      drawBarAtX(noteEndX);

      // capture layout for overlay (use fixed span for consistent mapping)
      layouts.push({
        startSec: meta.startSec,
        endSec: meta.endSec,
        x0: noteStartX,
        x1: noteEndX,
        y0: staffTopY,
        y1: staffBottomY
      });

      // next row
      const lastBottom = (haveRhythm && rhyStave ? rhyStave : melStave).getBottomY();
      currentY = lastBottom + SYSTEM_GAP_Y;
    }

    // emit multi-row layout payload
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

    // polish
    const svg = el.querySelector("svg") as SVGSVGElement | null;
    if (svg) {
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.style.display = "block";
      svg.style.width = "100%";
      svg.style.height = "100%";
    }

    return () => { el.innerHTML = ""; };
  }, [
    phrase, lyrics, rhythm,
    bpm, den, tsNum, leadInSec, useSharps,
    dims, secPerBeat, secPerBar, totalSec, wnPerSec, secPerWholeNote, clef, onLayout
  ]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: "relative", width: "100%", height: heightPx ? `${heightPx}px` : "100%" }}
    />
  );
}
