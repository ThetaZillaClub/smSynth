// components/training/layout/sheet/vexscore/builders.ts
import { midiToNoteName } from "@/utils/pitch/pitchMath";
import type { NoteValue } from "@/utils/time/tempo";
import { Beam } from "vexflow";

export type DurBase = "w" | "h" | "q" | "8" | "16";
export type DurString = DurBase | `${DurBase}d` | `${DurBase}dd`;
export type Tok = { dur: DurBase; dots: 0 | 1 | 2 };

export function pickClef(
  phrase: { notes?: Array<{ midi: number }> } | null | undefined
): "treble" | "bass" {
  const ns = phrase?.notes ?? [];
  if (!ns.length) return "treble";
  let below = 0;
  for (const n of ns) if (n.midi < 60) below++;
  return below > ns.length / 2 ? "bass" : "treble";
}

export function midiToVexKey(midi: number, useSharps: boolean) {
  const { name, octave } = midiToNoteName(midi, { useSharps, octaveAnchor: "C" });
  const letter = name[0].toLowerCase();
  const acc = name.length > 1 ? name.slice(1) : "";
  const key = acc ? `${letter}${acc}/${octave}` : `${letter}/${octave}`;
  return { key, accidental: acc || null };
}

export function tokToDuration(t: Tok): DurString {
  const dot = t.dots === 2 ? "dd" : t.dots === 1 ? "d" : "";
  return `${t.dur}${dot}` as DurString;
}

export function mapNoteValue(v: NoteValue): { tok: Tok; triplet?: boolean } {
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

/** Convert token to seconds (secPerWholeNote = 1 / wnPerSec) */
export function tokToSeconds(tok: Tok, secPerWholeNote: number): number {
  const baseWN: Record<DurBase, number> = { w: 1, h: 0.5, q: 0.25, "8": 0.125, "16": 0.0625 };
  const mul = tok.dots === 2 ? 1.75 : tok.dots === 1 ? 1.5 : 1;
  return baseWN[tok.dur] * mul * secPerWholeNote;
}

/** Greedy tokenization at whole→16th with dot support (uses wnPerSec) */
export function secondsToTokens(sec: number, wnPerSec: number): Tok[] {
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

export function buildBeams(notes: any[]) {
  const beams: any[] = [];
  let run: any[] = [];
  const flush = () => { if (run.length >= 2) beams.push(new Beam(run)); run = []; };
  for (const n of notes) {
    const d = n.getDuration?.();
    const isBeamed = typeof d === "string" && (d.startsWith("8") || d.startsWith("16"));
    if (isBeamed && !n.isRest?.()) run.push(n);
    else flush();
  }
  flush();
  return beams;
}
