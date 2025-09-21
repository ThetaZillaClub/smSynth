import { Voice, Formatter, TickContext } from "vexflow";
import type { Stave } from "vexflow";
import { buildBeams } from "../builders";
import type { Selected, TickPack } from "./types";
import { isRestish } from "./selection";

export function createVoices(tsNum: number, den: number, melSel: Selected, rhySel?: Selected | null) {
  const melVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
  melVoice.addTickables(melSel.t as any);
  const melFmt = new Formatter();
  melFmt.joinVoices([melVoice]);
  (melFmt as any).createTickContexts([melVoice]);
  melFmt.preFormat();

  let rhyVoice: Voice | null = null;
  if (rhySel) {
    rhyVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
    rhyVoice.addTickables(rhySel.t as any);
    const rhyFmt = new Formatter();
    rhyFmt.joinVoices([rhyVoice]);
    (rhyFmt as any).createTickContexts([rhyVoice]);
    rhyFmt.preFormat();
  }
  return { melVoice, rhyVoice };
}

export function placeTicks(
  ticks: any[],
  starts: number[],
  stave: Stave,
  xAt: (t0: number) => number,
  ctx: any,
  startSec: number
) {
  for (let i = 0; i < ticks.length; i++) {
    const n = ticks[i] as any;
    const tc = n.getTickContext?.();
    const x = xAt(starts[i] ?? startSec);
    if (tc?.setX) {
      tc.setX(x);
      tc.setXShift?.(0);
      (tc as any).preFormatted = true;
      (tc as any).postFormatted = true;
    }
    if (typeof n.setPreFormatted === "function") n.setPreFormatted(true);
    else (n as any).preFormatted = true;
    if (typeof n.setStave === "function") n.setStave(stave);
    if (typeof n.setContext === "function") n.setContext(ctx);
  }
}

function leftMostX(n: any): number {
  try {
    if (!isRestish(n) && typeof n.getNoteHeadBeginX === "function") return n.getNoteHeadBeginX();
    const bb = typeof n.getBoundingBox === "function" ? n.getBoundingBox() : null;
    if (bb) return bb.getX();
    const m = n.getMetrics?.();
    const w = (m?.noteHeadWidth && m.noteHeadWidth > 0) ? m.noteHeadWidth : 10;
    const ax = typeof n.getAbsoluteX === "function" ? n.getAbsoluteX() : (n.getTickContext?.().getX?.() ?? 0);
    return ax - w * 0.5;
  } catch { return 0; }
}

export function computeBarShiftX(args: {
  segments: Array<{ startSec: number; endSec: number; x0: number; x1: number }>;
  melSel: Selected;
  relBarAt: (pack: TickPack, selIdx: number) => number;
  mel: TickPack;
  barsPerRow: number;
  tsNum: number;
  den: number;
  downbeatEps: number;
}) {
  const { segments, melSel, relBarAt, mel, barsPerRow, tsNum, den, downbeatEps } = args;
  const barShiftX: number[] = Array(barsPerRow).fill(0);

  const densityOfBar = (bRel: number) => {
    let c = 0;
    for (let i = 0; i < melSel.t.length; i++) if (relBarAt(mel, i) === bRel) c++;
    return c;
  };

  for (let b = 0; b < barsPerRow; b++) {
    const seg = segments[b];
    const baseGapPx16 = (seg.x1 - seg.x0) * (den / (16 * tsNum));
    const d = densityOfBar(b);
    const shrink = d >= 12 ? 0.15 : d >= 8 ? 0.35 : 1.0;
    const gapPx16 = baseGapPx16 * shrink;

    // find tickable at downbeat; if it's a rest/ghost, try first non-rest in bar
    let idx = -1;
    for (let i = 0; i < melSel.t.length; i++) {
      if (relBarAt(mel, i) !== b) continue;
      const t0 = melSel.s[i];
      if (Math.abs(t0 - seg.startSec) <= downbeatEps) { idx = i; break; }
    }
    if (idx >= 0 && isRestish(melSel.t[idx])) {
      for (let j = idx; j < melSel.t.length; j++) {
        if (relBarAt(mel, j) !== b) break;
        if (!isRestish(melSel.t[j])) { idx = j; break; }
      }
    }

    if (idx >= 0 && !isRestish(melSel.t[idx])) {
      const curLeft = leftMostX(melSel.t[idx]);
      const targetLeft = seg.x0 + gapPx16;
      barShiftX[b] = targetLeft - curLeft;
    } else {
      barShiftX[b] = 0;
    }
  }
  return barShiftX;
}

export function applyBarShift(
  pack: TickPack,
  sel: Selected,
  barShiftX: number[],
  relBarAt: (pack: TickPack, selIdx: number) => number,
  xAt: (t0: number) => number
) {
  for (let i = 0; i < sel.t.length; i++) {
    const n = sel.t[i] as any;
    const bRel = relBarAt(pack, i);
    const dx = barShiftX[bRel] || 0;
    if (!dx) continue;
    const tc = n.getTickContext?.();
    if (tc?.setX) tc.setX((tc.getX?.() ?? xAt(sel.s[i])) + dx);
    if (tc) { (tc as any).preFormatted = true; (tc as any).postFormatted = true; }
  }
}

export function buildBeamsFor(sel: Selected, pack: TickPack, relBarAt: (pack: TickPack, selIdx: number) => number) {
  const groupKeys = sel.i.map((_, k) => relBarAt(pack, k));
  return buildBeams(sel.t, { groupKeys, allowMixed: true, sameStemOnly: true });
}

export function drawTickables(ticks: any[], stave: Stave, ctx: any) {
  for (const t of ticks) {
    if (typeof t.setStave === "function") t.setStave(stave);
    if (typeof t.setContext === "function") t.setContext(ctx);
    if (typeof t.draw === "function") t.draw();
  }
}

export function drawTuplets(tuplets: any[] | undefined, pool: any[], ctx: any) {
  if (!tuplets?.length) return;
  const inside = (tp: any) => {
    const notes = typeof tp.getNotes === "function" ? tp.getNotes() : [];
    return notes.length > 0 && notes.every((n: any) => pool.includes(n));
  };
  tuplets.filter(inside).forEach((t: any) => t.setContext(ctx).draw());
}

export function drawManualRests(
  list: Array<{ note: any; start: number; barIndex?: number }> | undefined,
  args: {
    ctx: any;
    stave: Stave;
    inWindow: (t0: number) => boolean;
    voiceSel: Selected;
    dupEps: number;
    xAt: (t0: number) => number;
    systemStartBar: number;
    barIndexOfTime: (t0: number) => number;
    barsPerRow: number;
    barShiftX: number[];
  }
) {
  if (!list?.length) return;
  const { ctx, stave, inWindow, voiceSel, dupEps, xAt, systemStartBar, barIndexOfTime, barsPerRow, barShiftX } = args;

  for (const { note, start, barIndex } of list) {
    if (!inWindow(start)) continue;

    // Hide manual rest if a non-rest/ghost tickable occurs at the same start.
    let suppress = false;
    for (let i = 0; i < voiceSel.t.length; i++) {
      if (Math.abs(voiceSel.s[i] - start) <= dupEps && !isRestish(voiceSel.t[i])) { suppress = true; break; }
    }
    if (suppress) continue;

    const absBar = (typeof barIndex === "number") ? barIndex : systemStartBar + barIndexOfTime(start);
    const bRel = Math.max(0, Math.min(barsPerRow - 1, absBar - systemStartBar));
    const x = xAt(start) + (barShiftX[bRel] || 0);

    note.setCenterAlignment?.(false);
    note.setCenterAligned?.(false);
    (note as any).center_alignment = false;
    note.setIgnoreTicks?.(true);
    (note as any).ignore_ticks = true;

    if (typeof note.setStave === "function") note.setStave(stave);
    if (typeof note.setContext === "function") note.setContext(ctx);

    const tc = new TickContext();
    tc.addTickable(note);
    tc.preFormat();
    tc.setX(x);
    note.setTickContext?.(tc);

    if (typeof note.setPreFormatted === "function") note.setPreFormatted(true);
    else (note as any).preFormatted = true;

    if (typeof note.draw === "function") note.draw();
  }
}

export function drawBarlines(args: {
  ctx: any;
  topStave: Stave;
  bottomStave: Stave;
  noteStartX: number;
  noteEndX: number;
  barsPerRow: number;
  isLastSystem: boolean;
}) {
  const { ctx, topStave, bottomStave, noteStartX, noteEndX, barsPerRow, isLastSystem } = args;
  const staffTopY = topStave.getYForLine(0);
  const staffBottomY = bottomStave.getYForLine(4);
  const BARLINE_W = 1.6;
  const BARLINE_COLOR = "rgba(15,15,15,1)";

  const drawBarAtX = (x: number) => {
    const xi = Math.round(x);
    ctx.beginPath();
    ctx.moveTo(xi, staffTopY);
    ctx.lineTo(xi, staffBottomY);
    ctx.setLineWidth(BARLINE_W);
    ctx.setStrokeStyle(BARLINE_COLOR);
    ctx.stroke();
  };

  const bandW = Math.max(1, noteEndX - noteStartX);
  for (let k = 1; k < barsPerRow; k++) drawBarAtX(noteStartX + (k / barsPerRow) * bandW);
  if (!isLastSystem) drawBarAtX(noteEndX);

  return { staffTopY, staffBottomY };
}
