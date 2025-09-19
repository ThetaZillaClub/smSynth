// components/training/layout/sheet/RhythmStaff.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Renderer,
  Stave,
  StaveNote,
  GhostNote,
  Voice,
  Formatter,
  Dot,
  Beam,
  Tuplet,
} from "vexflow";
import type { RhythmEvent } from "@/utils/phrase/generator";
import type { NoteValue } from "@/utils/time/tempo";

/**
 * Displays rhythm events as notes with correct lengths on a bass-clef staff.
 * - Uses one fixed pitch line (D3) for all sounded notes (percussive-style look).
 * - Rests are drawn as GhostNotes.
 * - Lead-in is honored as initial rests.
 * - Handles dotted values; supports triplets by forming Tuplets on runs of 3.
 *
 * NOTE: We only use fields available on RhythmEvent ({type, value}).
 */

type Props = {
  height?: number;
  rhythm: RhythmEvent[];
  running: boolean;

  /** Recorder anchor (unused here; parity with other components) */
  startAtMs?: number | null;

  /** Pre-roll lead-in (sec) — rendered as initial rests */
  leadInSec?: number;

  /** Transport (BPM/TS are display/layout only here) */
  bpm: number;
  den: number;
  tsNum: number;

  /** Tight padding so this sits right under the melody staff */
  compact?: boolean;
};

type DurTok = { dur: "w" | "h" | "q" | "8" | "16" | "32"; dots: 0 | 1 | 2; triplet?: boolean };

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

  // responsive width; fixed (or parent-driven) height
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

  // --- helpers ---

  // Convert NoteValue → base Vex duration + dots (+ triplet flag)
  const mapNoteValue = useMemo(() => {
    const map = (v: NoteValue): DurTok => {
      switch (v) {
        case "whole": return { dur: "w", dots: 0 };
        case "dotted-half": return { dur: "h", dots: 1 };
        case "half": return { dur: "h", dots: 0 };
        case "dotted-quarter": return { dur: "q", dots: 1 };
        case "triplet-quarter": return { dur: "q", dots: 0, triplet: true };
        case "quarter": return { dur: "q", dots: 0 };
        case "dotted-eighth": return { dur: "8", dots: 1 };
        case "triplet-eighth": return { dur: "8",  dots: 0, triplet: true };
        case "eighth": return { dur: "8", dots: 0 };
        case "dotted-sixteenth": return { dur: "16", dots: 1 };
        case "triplet-sixteenth": return { dur: "16", dots: 0, triplet: true };
        case "sixteenth": return { dur: "16", dots: 0 };
        case "thirtysecond": return { dur: "32", dots: 0 };
        default: return { dur: "8", dots: 0 };
      }
    };
    return map;
  }, []);

  // Quantize seconds to rests (lead-in only).
  const wnPerSec = useMemo(() => bpm / (60 * den), [bpm, den]);
  const secondsToTokens = (sec: number): DurTok[] => {
    // 1/32-whole grid with dot support
    const baseWN: Record<DurTok["dur"], number> = { w: 1, h: 0.5, q: 0.25, "8": 0.125, "16": 0.0625, "32": 0.03125 };
    const mk = (dur: DurTok["dur"], dots: DurTok["dots"]) => {
      const mul = dots === 2 ? 1.75 : dots === 1 ? 1.5 : 1;
      return [{ dur, dots, wn: baseWN[dur] * mul } as any];
    };
    const targets = [
      ...mk("w", 2), ...mk("w", 1), ...mk("w", 0),
      ...mk("h", 2), ...mk("h", 1), ...mk("h", 0),
      ...mk("q", 2), ...mk("q", 1), ...mk("q", 0),
      ...mk("8", 2), ...mk("8", 1), ...mk("8", 0),
      ...mk("16", 2), ...mk("16", 1), ...mk("16", 0),
      ...mk("32", 2), ...mk("32", 1), ...mk("32", 0),
    ];

    const totalWN = Math.max(0, sec * wnPerSec);
    const out: DurTok[] = [];
    let remain = totalWN;

    while (remain > 1e-6) {
      let pick: DurTok | null = null;
      for (const t of targets) {
        if (t.wn <= remain + 1e-6) { pick = { dur: t.dur, dots: t.dots }; break; }
      }
      if (!pick) pick = { dur: "32", dots: 0 };
      out.push(pick);
      const dwn =
        (pick.dur === "w" ? baseWN.w :
         pick.dur === "h" ? baseWN.h :
         pick.dur === "q" ? baseWN.q :
         pick.dur === "8" ? baseWN["8"] :
         pick.dur === "16" ? baseWN["16"] : baseWN["32"]) * (pick.dots === 2 ? 1.75 : pick.dots === 1 ? 1.5 : 1);
      remain -= dwn;
    }
    return out;
  };

  // simple beaming for 8th/16th/32nd runs
  function buildBeams(notes: (StaveNote | GhostNote)[]) {
    const beams: Beam[] = [];
    let run: StaveNote[] = [];
    const flush = () => { if (run.length >= 2) beams.push(new Beam(run)); run = []; };
    for (const n of notes) {
      if (n instanceof StaveNote) {
        const d = n.getDuration();
        const beamed = d.startsWith("8") || d.startsWith("16") || d.startsWith("32");
        if (beamed && !n.isRest()) run.push(n);
        else flush();
      } else flush();
    }
    flush();
    return beams;
  }

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !dims.w || !dims.h) return;

    // clear host
    el.innerHTML = "";
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(dims.w, dims.h);
    const ctx = renderer.getContext();

    const padding = compact
      ? { left: 12, right: 12, top: 0, bottom: 4 }
      : { left: 12, right: 12, top: 8, bottom: 8 };

    const stave = new Stave(padding.left, padding.top, Math.max(50, dims.w - padding.left - padding.right));
    stave.setClef("bass"); // percussive look
    stave.addTimeSignature(`${tsNum}/${den}`);
    stave.setContext(ctx).draw();

    const tickables: (StaveNote | GhostNote)[] = [];
    const tuplets: Tuplet[] = [];

    // lead-in as rests
    if (leadInSec > 1e-6) {
      for (const tok of secondsToTokens(leadInSec)) {
        const gn = new GhostNote({ duration: tok.dur + (tok.dots ? "d" : "") });
        tickables.push(gn);
        if (tok.dots) Dot.buildAndAttach([gn as any], { all: true });
      }
    }

    // Build notes directly from RhythmEvent (timeline order)
    let tripletBuffer: { base: DurTok["dur"]; note: StaveNote }[] = [];
    const flushTriplets = () => {
      for (let i = 0; i + 2 < tripletBuffer.length; i += 3) {
        const a = tripletBuffer[i], b = tripletBuffer[i + 1], c = tripletBuffer[i + 2];
        if (a.base === b.base && b.base === c.base) {
          tuplets.push(new Tuplet([a.note, b.note, c.note] as any));
        }
      }
      tripletBuffer = [];
    };

    for (const ev of rhythm) {
      const tok = mapNoteValue(ev.value);

      if (ev.type === "rest") {
        const gn = new GhostNote({ duration: tok.dur + (tok.dots ? "d" : "") });
        tickables.push(gn);
        if (tok.dots) Dot.buildAndAttach([gn as any], { all: true });
        flushTriplets();
      } else {
        const sn = new StaveNote({
          keys: ["d/3"],
          duration: tok.dur + (tok.dots ? "d" : ""),
          clef: "bass",
          autoStem: true,
        });
        if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });
        tickables.push(sn);

        if (tok.triplet) {
          tripletBuffer.push({ base: tok.dur, note: sn });
          if (tripletBuffer.length === 3) {
            const [a, b, c] = tripletBuffer;
            if (a.base === b.base && b.base === c.base) {
              tuplets.push(new Tuplet([a.note, b.note, c.note] as any));
            }
            tripletBuffer = [];
          }
        } else {
          flushTriplets();
        }
      }
    }
    flushTriplets();

    // voice & layout
    const voice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
    voice.addTickables(tickables as any);

    const fmt = new Formatter({ softmaxFactor: 5 });
    fmt.joinVoices([voice]).formatToStave([voice], stave);
    voice.draw(ctx, stave);

    // beams & tuplets
    const beams = buildBeams(tickables);
    beams.forEach((b) => b.setContext(ctx).draw());
    tuplets.forEach((t) => t.setContext(ctx).draw());

    // polish
    const svg = el.querySelector("svg") as SVGSVGElement | null;
    if (svg) {
      svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
      svg.style.display = "block";
      svg.style.width = "100%";
      svg.style.height = "100%";
    }

    return () => {
      el.innerHTML = "";
    };
  }, [dims, rhythm, leadInSec, bpm, den, tsNum, wnPerSec, mapNoteValue, compact]);

  return (
    <div
      ref={hostRef}
      style={{ position: "relative", width: "100%", height }}
    />
  );
}
