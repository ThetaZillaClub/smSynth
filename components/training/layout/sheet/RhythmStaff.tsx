// components/training/layout/sheet/RhythmStaff.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Renderer, Stave, StaveNote, GhostNote, Voice, Formatter, Dot, Tuplet } from "vexflow";
import type { RhythmEvent } from "@/utils/phrase/generator";
import { noteValueToSeconds } from "@/utils/time/tempo";
import {
  buildBeams as buildBeamsVF,
  secondsToTokens,
  tokToSeconds,
  mapNoteValue,
  type Tok,
} from "./vexscore/builders";

type Props = {
  height?: number;
  rhythm: RhythmEvent[];
  running: boolean;
  startAtMs?: number | null;
  leadInSec?: number;
  bpm: number;
  den: number;
  tsNum: number;
  compact?: boolean;
};

export default function RhythmStaff({
  height = 72,
  rhythm,
  leadInSec = 0,
  bpm,
  den,
  tsNum,
  compact = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: height });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(1, el.clientWidth || Math.round(el.getBoundingClientRect().width));
      const h = Math.max(56, height || Math.round(el.getBoundingClientRect().height) || 72);
      setDims((p) => (p.w !== w || p.h !== h ? { w, h } : p));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const wnPerSec = useMemo(() => bpm / (60 * den), [bpm, den]);
  const secPerWholeNote = useMemo(() => 1 / Math.max(1e-9, wnPerSec), [wnPerSec]);
  const secPerBeat = useMemo(() => (60 / Math.max(1, bpm)) * (4 / Math.max(1, den)), [bpm, den]);
  const secPerBar  = useMemo(() => tsNum * secPerBeat, [tsNum, secPerBeat]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !dims.w || !dims.h) return;

    el.innerHTML = "";
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(dims.w, dims.h);
    const ctx = renderer.getContext();

    const padding = compact
      ? { left: 12, right: 12, top: 0, bottom: 4 }
      : { left: 12, right: 12, top: 8, bottom: 8 };

    const stave = new Stave(padding.left, padding.top, Math.max(50, dims.w - padding.left - padding.right));
    stave.setClef("bass");
    stave.addTimeSignature(`${tsNum}/${den}`);
    stave.setContext(ctx).draw();

    const tickables: (StaveNote | GhostNote)[] = [];
    const tickStarts: number[] = [];
    const tuplets: Tuplet[] = [];

    let tSec = 0;

    // lead-in as rests (use shared secondsToTokens with 32nd resolution)
    if (leadInSec > 1e-6) {
      for (const tok of secondsToTokens(leadInSec, wnPerSec, "32")) {
        const gn = new GhostNote({ duration: tok.dur + (tok.dots ? "d" : "") });
        tickables.push(gn);
        tickStarts.push(tSec);
        if (tok.dots) Dot.buildAndAttach([gn as any], { all: true });
        tSec += tokToSeconds(tok as Tok, secPerWholeNote);
      }
    }

    // timeline
    let tripletBuffer: { base: Tok["dur"]; note: StaveNote }[] = [];
    const flushTriplets = () => {
      for (let i = 0; i + 2 < tripletBuffer.length; i += 3) {
        const a = tripletBuffer[i], b = tripletBuffer[i + 1], c = tripletBuffer[i + 2];
        if (a.base === b.base && b.base === c.base) tuplets.push(new Tuplet([a.note, b.note, c.note] as any));
      }
      tripletBuffer = [];
    };

    for (const ev of rhythm) {
      const durSec = noteValueToSeconds(ev.value, bpm, den);
      const { tok, triplet } = mapNoteValue(ev.value);

      if (ev.type === "rest") {
        const gn = new GhostNote({ duration: tok.dur + (tok.dots ? "d" : "") });
        tickables.push(gn);
        tickStarts.push(tSec);
        if (tok.dots) Dot.buildAndAttach([gn as any], { all: true });
        tSec += durSec;
        flushTriplets();
      } else {
        const sn = new StaveNote({ keys: ["d/3"], duration: tok.dur + (tok.dots ? "d" : ""), clef: "bass", autoStem: true });
        if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });
        tickables.push(sn);
        tickStarts.push(tSec);
        tSec += durSec;

        if (triplet) {
          tripletBuffer.push({ base: tok.dur, note: sn });
          if (tripletBuffer.length === 3) flushTriplets();
        } else {
          flushTriplets();
        }
      }
    }
    flushTriplets();

    const voice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
    voice.addTickables(tickables as any);
    new Formatter({ softmaxFactor: 5 }).joinVoices([voice]).formatToStave([voice], stave);

    // Build beams BEFORE drawing notes so flags are suppressed on beamed notes.
    const groupKeys = tickStarts.map((t0) => Math.floor(t0 / secPerBar));
    const beams = buildBeamsVF(tickables as any, { groupKeys });

    // Draw notes, then beams & tuplets.
    voice.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    tuplets.forEach((t) => t.setContext(ctx).draw());

    const svg = el.querySelector("svg") as SVGSVGElement | null;
    if (svg) {
      svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
      svg.style.display = "block";
      svg.style.width = "100%";
      svg.style.height = "100%";
    }

    return () => { el.innerHTML = ""; };
  }, [dims, rhythm, leadInSec, bpm, den, tsNum, wnPerSec, secPerWholeNote, compact, secPerBar]);

  return <div ref={hostRef} style={{ position: "relative", width: "100%", height }} />;
}
