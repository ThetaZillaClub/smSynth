// components/training/layout/sheet/vexscore/makeTickables/time.ts
import type { NoteValue } from "@/utils/time/tempo";
import { noteValueInQuarterUnits } from "@/utils/time/tempo";
import type { Tok } from "../builders";

/** PPQ grid: 960 ticks per quarter */
export const PPQ = 960;

/* ---------- ticks/quarters ---------- */
export function ticksToSeconds(ticks: number, secPerQuarter: number): number {
  return (ticks / PPQ) * secPerQuarter;
}

export function tokQuarterUnits(tok: Tok): number {
  const base: Record<Tok["dur"], number> = {
    w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, "32": 0.125,
  };
  const mul = tok.dots === 2 ? 1.75 : tok.dots === 1 ? 1.5 : 1;
  return base[tok.dur] * mul;
}

export function tokToTicks(tok: Tok): number {
  return Math.round(tokQuarterUnits(tok) * PPQ);
}

export function noteValueToTicks(v: NoteValue): number {
  const q = noteValueInQuarterUnits(v);
  return Math.round(q * PPQ);
}

/* ---------- tokenization in TICKS for bar-accurate padding ---------- */
export const TOK_LADDER: Tok[] = [
  { dur: "w", dots: 0 },   // 4q = 3840
  { dur: "h", dots: 1 },   // 3q = 2880
  { dur: "h", dots: 0 },   // 2q = 1920
  { dur: "q", dots: 1 },   // 1.5q = 1440
  { dur: "q", dots: 0 },   // 1q = 960
  { dur: "8", dots: 1 },   // 0.75q = 720
  { dur: "8", dots: 0 },   // 0.5q = 480
  { dur: "16", dots: 1 },  // 0.375q = 360
  { dur: "16", dots: 0 },  // 0.25q = 240
  { dur: "32", dots: 1 },  // 0.1875q = 180
  { dur: "32", dots: 0 },  // 0.125q = 120
];

export function ticksToToks(remTicks: number): Tok[] {
  const toks: Tok[] = [];
  let r = Math.max(0, Math.round(remTicks));
  for (const t of TOK_LADDER) {
    const dt = tokToTicks(t);
    while (r >= dt) {
      toks.push(t);
      r -= dt;
    }
    if (r === 0) break;
  }
  return toks;
}
