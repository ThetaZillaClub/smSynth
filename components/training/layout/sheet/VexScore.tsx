// components/training/layout/sheet/VexScore.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  GhostNote,
  Voice,
  Formatter,
  Accidental,
  Dot,
  Tuplet,
  Beam,
  Annotation,
  AnnotationHorizontalJustify as AHJ,
  AnnotationVerticalJustify as AVJ,
} from "vexflow";
import type { Phrase } from "@/utils/piano-roll/scale";
import type { RhythmEvent } from "@/utils/phrase/generator";
import type { NoteValue } from "@/utils/time/tempo";
import { midiToNoteName } from "@/utils/pitch/pitchMath";

type Props = {
  phrase: Phrase;
  lyrics?: string[];
  /** Transport for duration mapping. Defaults to 80 bpm, denominator=4 */
  bpm?: number;
  den?: number;
  /** numerator (for time signature & voice) */
  tsNum?: number;
  /** Optional fixed height (defaults to parent height) */
  heightPx?: number;
  /** pre-roll (sec) added as initial rest */
  leadInSec?: number;
  /** spell sharps vs flats (default sharps) */
  useSharps?: boolean;
  /** Force clef for melody, otherwise auto-pick by range */
  clef?: "treble" | "bass";
  /** Rhythm line events to engrave on a **separate connected staff** */
  rhythm?: RhythmEvent[];
  /** Report the engraved note band for perfect overlay alignment (X of top staff) */
  onLayout?: (m: { noteStartX: number; noteEndX: number }) => void;
  className?: string;
};

/** Base VexFlow duration tokens we use */
type DurBase = "w" | "h" | "q" | "8" | "16";
type DurString = DurBase | `${DurBase}d` | `${DurBase}dd`;
type Tok = { dur: DurBase; dots: 0 | 1 | 2 };

function tokToDuration(t: Tok): DurString {
  const dot = t.dots === 2 ? "dd" : t.dots === 1 ? "d" : "";
  return `${t.dur}${dot}` as DurString;
}

function pickClef(phrase: Phrase | null | undefined): "treble" | "bass" {
  const ns = phrase?.notes ?? [];
  if (!ns.length) return "treble";
  let below = 0;
  for (const n of ns) if (n.midi < 60) below++;
  return below > ns.length / 2 ? "bass" : "treble";
}

/** Map our NoteValue to a base VexFlow duration + dots (+ triplet hint) */
function mapNoteValue(v: NoteValue): { tok: Tok; triplet?: boolean } {
  switch (v) {
    case "whole": return { tok: { dur: "w", dots: 0 } };
    case "dotted-half": return { tok: { dur: "h", dots: 1 } };
    case "half": return { tok: { dur: "h", dots: 0 } };
    case "dotted-quarter": return { tok: { dur: "q", dots: 1 } };
    case "triplet-quarter": return { tok: { dur: "q", dots: 0 }, triplet: true };
    case "quarter": return { tok: { dur: "q", dots: 0 } };
    case "dotted-eighth": return { tok: { dur: "8", dots: 1 } };
    case "triplet-eighth": return { tok: { dur: "8", dots: 0 }, triplet: true };
    case "eighth": return { tok: { dur: "8", dots: 0 } };
    case "dotted-sixteenth": return { tok: { dur: "16", dots: 1 } };
    case "triplet-sixteenth": return { tok: { dur: "16", dots: 0 }, triplet: true };
    case "sixteenth": return { tok: { dur: "16", dots: 0 } };
    default: return { tok: { dur: "8", dots: 0 } };
  }
}

export default function VexScore({
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
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: heightPx ?? 200 });
  const lastLayoutRef = useRef<{ noteStartX: number; noteEndX: number } | null>(null);

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

  const wnPerSec = useMemo(() => bpm / (60 * den), [bpm, den]);

  function secondsToTokens(sec: number): Tok[] {
    const baseWN: Record<DurBase, number> = { w: 1, h: 0.5, q: 0.25, "8": 0.125, "16": 0.0625 };
    const targets: Array<{ dur: DurBase; dots: 0 | 1 | 2; wn: number }> = [
      { dur: "w", dots: 2, wn: baseWN.w * 1.75 },
      { dur: "w", dots: 1, wn: baseWN.w * 1.5 },
      { dur: "w", dots: 0, wn: baseWN.w },
      { dur: "h", dots: 2, wn: baseWN.h * 1.75 },
      { dur: "h", dots: 1, wn: baseWN.h * 1.5 },
      { dur: "h", dots: 0, wn: baseWN.h },
      { dur: "q", dots: 2, wn: baseWN.q * 1.75 },
      { dur: "q", dots: 1, wn: baseWN.q * 1.5 },
      { dur: "q", dots: 0, wn: baseWN.q },
      { dur: "8", dots: 2, wn: baseWN["8"] * 1.75 },
      { dur: "8", dots: 1, wn: baseWN["8"] * 1.5 },
      { dur: "8", dots: 0, wn: baseWN["8"] },
      { dur: "16", dots: 2, wn: baseWN["16"] * 1.75 },
      { dur: "16", dots: 1, wn: baseWN["16"] * 1.5 },
      { dur: "16", dots: 0, wn: baseWN["16"] },
    ];
    const totalWN = Math.max(0, sec * wnPerSec);
    const out: Tok[] = [];
    let remain = totalWN;
    while (remain > 1e-6) {
      let pick: Tok | null = null;
      for (const t of targets) {
        if (t.wn <= remain + 1e-6) { pick = { dur: t.dur, dots: t.dots }; break; }
      }
      if (!pick) pick = { dur: "16", dots: 0 };
      out.push(pick);
      const dwn =
        (pick.dur === "w" ? baseWN.w :
         pick.dur === "h" ? baseWN.h :
         pick.dur === "q" ? baseWN.q :
         pick.dur === "8" ? baseWN["8"] : baseWN["16"]) * (pick.dots === 2 ? 1.75 : pick.dots === 1 ? 1.5 : 1);
      remain -= dwn;
    }
    return out;
  }

  function midiToVexKey(midi: number) {
    const { name, octave } = midiToNoteName(midi, { useSharps, octaveAnchor: "C" });
    const letter = name[0].toLowerCase();
    const acc = name.length > 1 ? name.slice(1) : "";
    const key = acc ? `${letter}${acc}/${octave}` : `${letter}/${octave}`;
    return { key, accidental: acc || null };
  }

  function buildBeams(notes: (StaveNote | GhostNote)[]) {
    const beams: Beam[] = [];
    let run: StaveNote[] = [];
    const flush = () => { if (run.length >= 2) beams.push(new Beam(run)); run = []; };
    for (const n of notes) {
      if (n instanceof StaveNote) {
        const d = n.getDuration();
        const isBeamed = d.startsWith("8") || d.startsWith("16");
        if (isBeamed && !n.isRest()) run.push(n);
        else flush();
      } else flush();
    }
    flush();
    return beams;
  }

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !dims.w || !dims.h) return;

    const clef = clefProp ?? pickClef(phrase);
    const haveRhythm = Array.isArray(rhythm) && rhythm.length > 0;

    // clear & init renderer
    el.innerHTML = "";
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(dims.w, dims.h);
    const ctx = renderer.getContext();

    // Layout paddings and vertical stacking
    const padding = { left: 12, right: 12, top: 10, gap: 16, bottom: 10 };
    const staffWidth = Math.max(50, dims.w - padding.left - padding.right);

    // Decide staff heights
    const melodyH = haveRhythm ? Math.max(90, Math.floor(dims.h * 0.55)) : Math.max(90, dims.h - 16);
    const rhythmH = haveRhythm ? Math.max(70, dims.h - melodyH - padding.gap) : 0;

    // Create staves
    const melodyY = padding.top;
    const rhythmY = haveRhythm ? melodyY + melodyH + padding.gap : 0;

    const melodyStave = new Stave(padding.left, melodyY, staffWidth);
    melodyStave.setClef(clef);
    melodyStave.addTimeSignature(`${tsNum}/${den}`);
    melodyStave.setContext(ctx).draw();

    let rhythmStave: Stave | null = null;
    if (haveRhythm) {
      rhythmStave = new Stave(padding.left, rhythmY, staffWidth);
      rhythmStave.setClef("bass"); // percussive / rhythm look
      rhythmStave.addTimeSignature(`${tsNum}/${den}`);
      rhythmStave.setContext(ctx).draw();

      // Connect the two staves with a brace & single line at left
      const brace = new StaveConnector(melodyStave, rhythmStave);
      brace.setType(StaveConnector.type.BRACE).setContext(ctx).draw();
      const singleLeft = new StaveConnector(melodyStave, rhythmStave);
      singleLeft.setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
      const singleRight = new StaveConnector(melodyStave, rhythmStave);
      singleRight.setType(StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
    }

    // Tempo label on top staff
    ctx.save();
    ctx.setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "");
    ctx.fillText(`${bpm} BPM`, padding.left + 4, Math.max(10, melodyY - 2));
    ctx.restore();

    // ---------- Build tickables ----------
    const melodyTickables: (StaveNote | GhostNote)[] = [];
    const rhythmTickables: (StaveNote | GhostNote)[] = [];
    const tuplets: Tuplet[] = [];

    // shared lead-in (both staves) to keep alignment
    if (leadInSec > 1e-6) {
      const toks = secondsToTokens(leadInSec);
      for (const tok of toks) {
        const d = tokToDuration(tok);
        const mRest = new GhostNote({ duration: d });
        melodyTickables.push(mRest);
        if (haveRhythm) {
          const rRest = new GhostNote({ duration: d });
          rhythmTickables.push(rRest);
          if (tok.dots) Dot.buildAndAttach([rRest as any], { all: true });
        }
        if (tok.dots) Dot.buildAndAttach([mRest as any], { all: true });
      }
    }

    // ----- Melody notes -----
    const notes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
    if (!notes.length) {
      melodyTickables.push(new StaveNote({ keys: ["b/4"], duration: "wr", clef }));
    } else {
      let cursorSec = 0;
      let lyricIndex = 0;
      const tol = 1e-4;

      for (const n of notes) {
        if (n.startSec - cursorSec > tol) {
          for (const tok of secondsToTokens(n.startSec - cursorSec)) {
            const gn = new GhostNote({ duration: tokToDuration(tok) });
            melodyTickables.push(gn);
            if (tok.dots) Dot.buildAndAttach([gn as any], { all: true });
          }
          cursorSec = n.startSec;
        }

        const toks = secondsToTokens(n.durSec);
        const { key, accidental } = midiToVexKey(n.midi);
        toks.forEach((tok, idx) => {
          const sn = new StaveNote({
            keys: [key],
            duration: tokToDuration(tok),
            clef,
            autoStem: true,
          });
          if (accidental) sn.addModifier(new Accidental(accidental), 0);
          if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });

          if (idx === 0 && lyrics && lyrics[lyricIndex]) {
            const ann = new Annotation(lyrics[lyricIndex])
              .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
              .setVerticalJustification(AVJ.BOTTOM)
              .setJustification(AHJ.CENTER);
            sn.addModifier(ann, 0);
          }

          melodyTickables.push(sn);
        });

        lyricIndex++;
        cursorSec = n.startSec + n.durSec;
      }
    }

    // ----- Rhythm notes (separate staff) -----
    if (haveRhythm && rhythmStave) {
      const rhythmKey = "d/3"; // fixed pitch line for percussive look
      let tripletBuf: { base: DurBase; note: StaveNote }[] = [];

      const flushTriplets = () => {
        for (let i = 0; i + 2 < tripletBuf.length; i += 3) {
          const a = tripletBuf[i], b = tripletBuf[i + 1], c = tripletBuf[i + 2];
          if (a.base === b.base && b.base === c.base) {
            tuplets.push(new Tuplet([a.note, b.note, c.note] as any));
          }
        }
        tripletBuf = [];
      };

      for (const ev of rhythm!) {
        const { tok, triplet } = mapNoteValue(ev.value);
        const dur = tokToDuration(tok);

        if (ev.type === "rest") {
          const gn = new GhostNote({ duration: dur });
          rhythmTickables.push(gn);
          if (tok.dots) Dot.buildAndAttach([gn as any], { all: true });
          flushTriplets();
        } else {
          const sn = new StaveNote({
            keys: [rhythmKey],
            duration: dur,
            clef: "bass",
            autoStem: true,
          });
          if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });
          rhythmTickables.push(sn);

          if (triplet) {
            tripletBuf.push({ base: tok.dur, note: sn });
            if (tripletBuf.length === 3) flushTriplets();
          } else {
            flushTriplets();
          }
        }
      }
      flushTriplets();
    }

    // ---------- Voices & formatting ----------
    const melodyVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
    melodyVoice.addTickables(melodyTickables as any);

    const fmtMelody = new Formatter({ softmaxFactor: 5 });
    fmtMelody.joinVoices([melodyVoice]).formatToStave([melodyVoice], melodyStave);
    melodyVoice.draw(ctx, melodyStave);

    const melodyBeams = buildBeams(melodyTickables);
    melodyBeams.forEach((b) => b.setContext(ctx).draw());

    if (haveRhythm && rhythmStave) {
      const rhythmVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
      rhythmVoice.addTickables(rhythmTickables as any);

      const fmtRhythm = new Formatter({ softmaxFactor: 5 });
      fmtRhythm.joinVoices([rhythmVoice]).formatToStave([rhythmVoice], rhythmStave);
      rhythmVoice.draw(ctx, rhythmStave);

      const rhythmBeams = buildBeams(rhythmTickables);
      rhythmBeams.forEach((b) => b.setContext(ctx).draw());
    }

    // ---------- Static measure bars & numbers across both staves ----------
    const secPerBeat = (60 / Math.max(1, bpm)) * (4 / Math.max(1, den));
    const secPerBar = tsNum * secPerBeat;
    const totalSec = Math.max(leadInSec + (phrase?.durationSec ?? 0), 1e-3);

    const noteStartX = typeof (melodyStave as any).getNoteStartX === "function"
      ? (melodyStave as any).getNoteStartX()
      : melodyStave.getX() + 48;
    const noteEndX = typeof (melodyStave as any).getNoteEndX === "function"
      ? (melodyStave as any).getNoteEndX()
      : melodyStave.getX() + melodyStave.getWidth() - 12;

    // report layout once (top staff X band)
    if (onLayout) {
      const prev = lastLayoutRef.current;
      if (!prev || Math.abs(prev.noteStartX - noteStartX) > 0.5 || Math.abs(prev.noteEndX - noteEndX) > 0.5) {
        lastLayoutRef.current = { noteStartX, noteEndX };
        onLayout({ noteStartX, noteEndX });
      }
    }

    ctx.save();
    const topY = Math.max(0, melodyY - 2);
    const botY = haveRhythm ? (rhythmY + rhythmH + 6) : (melodyY + melodyH + 6);

    for (let t = 0; t <= totalSec + 1e-6; t += secPerBar) {
      const x = noteStartX + (t / totalSec) * (noteEndX - noteStartX);

      // draw a full-height vertical bar spanning both staves
      ctx.beginPath();
      ctx.moveTo(x + 0.5, topY);
      ctx.lineTo(x + 0.5, botY);
      ctx.setLineWidth(2);
      ctx.setStrokeStyle("rgba(15,15,15,0.45)");
      ctx.stroke();

      if (t > 1e-6) {
        const mNum = Math.round(t / secPerBar);
        ctx.setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 11, "");
        ctx.setFillStyle("#0f0f0f");
        ctx.fillText(String(mNum), x + 6, Math.max(9, melodyY - 4));
      }
    }
    ctx.restore();

    // polish SVG
    const svg = el.querySelector("svg") as SVGSVGElement | null;
    if (svg) {
      svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
      svg.style.display = "block";
      svg.style.width = "100%";
      svg.style.height = "100%";
    }

    return () => { el.innerHTML = ""; };
  }, [phrase, lyrics, rhythm, bpm, den, tsNum, leadInSec, useSharps, dims, clefProp, onLayout]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%" }}
    />
  );
}
