// components/training/layout/sheet/vexscore/drawSystem.ts
import { Stave, StaveConnector, Voice, Formatter } from "vexflow";
import { STAFF_GAP_Y } from "./layout";
import { buildBeams } from "./builders";
import type { SystemLayout } from "./types";

type DrawParams = {
  ctx: any;
  padding: { left: number; right: number };
  currentY: number;
  staffWidth: number;
  tsNum: number;
  den: number;
  clef: "treble" | "bass";
  haveRhythm: boolean;
  systemWindow: { startSec: number; endSec: number; contentEndSec: number };
  mel: { ticks: any[]; starts: number[]; tuplets?: any[] };
  rhy: { ticks: any[]; starts: number[]; tuplets: any[] };
  secPerBar: number;
  /** NEW: bars per row for this score (consistent across systems). */
  barsPerRow: 4 | 3 | 2;
};

export function drawSystem({
  ctx,
  padding,
  currentY,
  staffWidth,
  tsNum,
  den,
  clef,
  haveRhythm,
  systemWindow,
  mel,
  rhy,
  secPerBar,
  barsPerRow,
}: DrawParams) {
  const { startSec, endSec, contentEndSec } = systemWindow;

  // ----- staves -----
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

  // ----- geometry across the row -----
  const noteStartX =
    typeof (melStave as any).getNoteStartX === "function"
      ? (melStave as any).getNoteStartX()
      : melStave.getX() + 48;
  const noteEndX =
    typeof (melStave as any).getNoteEndX === "function"
      ? (melStave as any).getNoteEndX()
      : melStave.getX() + melStave.getWidth() - 12;

  const bandW = Math.max(1, noteEndX - noteStartX);
  const barW = bandW / barsPerRow;

  // tolerances (seconds)
  const eps = Math.max(1e-6, secPerBar / (tsNum * 512));
  const secPerBeat = secPerBar / tsNum;
  const downbeatEps = Math.max(1e-6, secPerBeat / 128);
  const dupEps = Math.max(1e-6, secPerBeat / 512);

  const windowEnd = Math.min(endSec, contentEndSec);

  // full-width bar segments
  const segments = Array.from({ length: barsPerRow }, (_, i) => {
    const segStartSec = startSec + i * secPerBar;
    const segEndSec = segStartSec + secPerBar;
    const barX0 = noteStartX + i * barW;
    const barX1 = noteStartX + (i + 1) * barW;
    return { startSec: segStartSec, endSec: segEndSec, x0: barX0, x1: barX1 };
  });

  // half-open window [start, windowEnd)
  const inWindow = (t0: number) => t0 >= startSec - eps && t0 < windowEnd - eps;

  const barIndexOf = (t0: number) => {
    const rel = Math.max(0, t0 - startSec);
    let idx = Math.floor((rel + eps) / secPerBar);
    if (idx < 0) idx = 0;
    if (idx >= barsPerRow) idx = barsPerRow - 1;
    return idx;
  };

  const xAt = (t0: number) => {
    const idx = barIndexOf(t0);
    const seg = segments[idx];
    const dur = Math.max(1e-6, seg.endSec - seg.startSec);
    let u = (t0 - seg.startSec) / dur;
    if (u < 0 && u > -eps) u = 0;
    if (u > 1 && u < 1 + eps) u = 1;
    u = Math.max(0, Math.min(1, u));
    return seg.x0 + u * (seg.x1 - seg.x0);
  };

  // Filter tickables to system window
  const sel = (ticks: any[], starts: number[]) => {
    const outT: any[] = [];
    const outS: number[] = [];
    for (let i = 0; i < ticks.length; i++) {
      const t0 = starts[i];
      if (inWindow(t0)) { outT.push(ticks[i]); outS.push(t0); }
    }
    return { t: outT, s: outS };
  };
  let melSel = sel(mel.ticks, mel.starts);
  let rhySel = haveRhythm && rhyStave ? sel(rhy.ticks, rhy.starts) : { t: [] as any[], s: [] as number[] };

  // helpers
  const isRest = (note: any): boolean => {
    if (typeof note?.isRest === "function") return !!note.isRest();
    const d = note?.getDuration?.();
    if (typeof d === "string" && d.endsWith("r")) return true;
    const cat = typeof note?.getCategory === "function" ? note.getCategory() : "";
    if (typeof cat === "string" && cat.toLowerCase().includes("ghost")) return true;
    return false;
  };

  // De-duplicate events with the same start time (floating rounding)
  const dedupeSameStart = (selObj: { t: any[]; s: number[] }) => {
    const T = selObj.t, S = selObj.s;
    if (T.length <= 1) return selObj;
    const outT: any[] = [];
    const outS: number[] = [];
    for (let i = 0; i < T.length; i++) {
      const curT = T[i], curS = S[i];
      if (!outS.length) { outT.push(curT); outS.push(curS); continue; }
      const j = outS.length - 1;
      if (Math.abs(curS - outS[j]) <= dupEps) {
        const keepIncoming = isRest(outT[j]) && !isRest(curT);
        if (keepIncoming) { outT[j] = curT; outS[j] = curS; }
      } else {
        outT.push(curT); outS.push(curS);
      }
    }
    return { t: outT, s: outS };
  };

  melSel = dedupeSameStart(melSel);
  if (haveRhythm && rhyStave) rhySel = dedupeSameStart(rhySel);

  // create tick contexts only (no justification)
  const melVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
  melVoice.addTickables(melSel.t as any);
  const melFmt = new Formatter();
  melFmt.joinVoices([melVoice]);
  (melFmt as any).createTickContexts([melVoice]);
  melFmt.preFormat();

  let rhyVoice: Voice | null = null;
  if (haveRhythm && rhyStave) {
    rhyVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
    rhyVoice.addTickables(rhySel.t as any);
    const rhyFmt = new Formatter();
    rhyFmt.joinVoices([rhyVoice]);
    (rhyFmt as any).createTickContexts([rhyVoice]);
    rhyFmt.preFormat();
  }

  // 1) place each tickable at its linear musical X and bind stave/context
  const placeTicks = (ticks: any[], starts: number[], stave: Stave) => {
    for (let i = 0; i < ticks.length; i++) {
      const n = ticks[i] as any;
      const tc = n.getTickContext?.();
      const x = xAt(starts[i] ?? startSec);
      if (tc?.setX) { tc.setX(x); (tc as any).preFormatted = true; (tc as any).postFormatted = true; }
      if (typeof n.setPreFormatted === "function") n.setPreFormatted(true);
      else (n as any).preFormatted = true;
      if (typeof n.setStave === "function") n.setStave(stave);
      if (typeof n.setContext === "function") n.setContext(ctx);
    }
  };
  placeTicks(melSel.t, melSel.s, melStave);
  if (haveRhythm && rhyVoice && rhyStave) placeTicks(rhySel.t, rhySel.s, rhyStave);

  // leftmost x for the tickable’s drawn glyph (note or rest)
  const leftMostX = (n: any): number => {
    try {
      if (!isRest(n) && typeof n.getNoteHeadBeginX === "function") return n.getNoteHeadBeginX();
      const bb = typeof n.getBoundingBox === "function" ? n.getBoundingBox() : null;
      if (bb) return bb.getX();
      const m = n.getMetrics?.();
      const w = (m?.noteHeadWidth && m.noteHeadWidth > 0) ? m.noteHeadWidth : 10;
      const ax = typeof n.getAbsoluteX === "function" ? n.getAbsoluteX() : (n.getTickContext?.().getX?.() ?? 0);
      return ax - w * 0.5;
    } catch { return 0; }
  };

  // === Density-aware bar padding shrink ===
  // we reduce the initial downbeat padding as measures get denser.
  const densityOfBar = (b: number) => {
    const seg = segments[b];
    let c = 0;
    for (let i = 0; i < melSel.s.length; i++) {
      const t0 = melSel.s[i];
      if (t0 >= seg.startSec - eps && t0 < seg.endSec - eps) c++;
    }
    return c;
  };

  const barShiftX: number[] = Array(barsPerRow).fill(0);

  for (let b = 0; b < barsPerRow; b++) {
    const seg = segments[b];

    // base gap is one 16th of the bar; shrink it when dense
    const baseGapPx16 = (seg.x1 - seg.x0) * (den / (16 * tsNum));
    const d = densityOfBar(b);
    const shrink =
      d >= 12 ? 0.15 :   // very dense
      d >= 8  ? 0.35 :   // dense
                1.0;     // normal
    const gapPx16 = baseGapPx16 * shrink;

    // find first tickable at exact downbeat
    let idx = -1;
    for (let i = 0; i < melSel.t.length; i++) {
      const t0 = melSel.s[i];
      if (t0 < seg.startSec - eps || t0 >= seg.endSec - eps) continue;
      if (Math.abs(t0 - seg.startSec) <= downbeatEps) { idx = i; break; }
    }

    if (idx >= 0) {
      const curLeft = leftMostX(melSel.t[idx]);
      const targetLeft = seg.x0 + gapPx16;
      barShiftX[b] = targetLeft - curLeft;
    } else {
      barShiftX[b] = 0;
    }
  }

  // apply uniform per-bar shift (keeps timing linear inside each bar)
  const applyBarShift = (ticks: any[], starts: number[]) => {
    for (let i = 0; i < ticks.length; i++) {
      const n = ticks[i] as any;
      const b = barIndexOf(starts[i] ?? startSec);
      const dx = barShiftX[b] || 0;
      if (!dx) continue;
      const tc = n.getTickContext?.();
      if (tc?.setX) tc.setX((tc.getX?.() ?? xAt(starts[i])) + dx);
      if (tc) { (tc as any).preFormatted = true; (tc as any).postFormatted = true; }
    }
  };
  applyBarShift(melSel.t, melSel.s);
  if (haveRhythm && rhyVoice && rhyStave) applyBarShift(rhySel.t, rhySel.s);

  // 3) beams after positions are final
  const melGroupKeys = melSel.s.map((t0) => barIndexOf(t0));
  const melBeams = buildBeams(melSel.t, { groupKeys: melGroupKeys, allowMixed: true, sameStemOnly: true });
  let rhyBeams: any[] = [];
  if (haveRhythm && rhyVoice && rhyStave) {
    const rhyGroupKeys = rhySel.s.map((t0) => barIndexOf(t0));
    rhyBeams = buildBeams(rhySel.t, { groupKeys: rhyGroupKeys, allowMixed: true, sameStemOnly: true });
  }

  // 4) manual draw
  const drawTickables = (ticks: any[], stave: Stave) => {
    for (const t of ticks) {
      if (typeof t.setStave === "function") t.setStave(stave);
      if (typeof t.setContext === "function") t.setContext(ctx);
      if (typeof t.draw === "function") t.draw();
    }
  };
  drawTickables(melSel.t, melStave);
  melBeams.forEach((b) => b.setContext(ctx).draw());

  const tupletHasAny = (tp: any, pool: any[]) => {
    const notes = typeof tp.getNotes === "function" ? tp.getNotes() : [];
    return notes.some((n: any) => pool.includes(n));
  };
  (mel.tuplets || [])
    .filter((t: any) => tupletHasAny(t, melSel.t))
    .forEach((t: any) => t.setContext(ctx).draw());

  if (haveRhythm && rhyStave) {
    drawTickables(rhySel.t, rhyStave);
    rhyBeams.forEach((b) => b.setContext(ctx).draw());
    (rhy.tuplets || [])
      .filter((t: any) => tupletHasAny(t, rhySel.t))
      .forEach((t: any) => t.setContext(ctx).draw());
  }

  // exact barlines from our geometry
  const staffTopY = melStave.getYForLine(0) - 6;
  const staffBottomY = (haveRhythm && rhyStave ? rhyStave : melStave).getYForLine(4) + 6;
  const drawBarAtX = (x: number) => {
    const xi = Math.round(x);
    ctx.beginPath();
    ctx.moveTo(xi, staffTopY);
    ctx.lineTo(xi, staffBottomY);
    ctx.setLineWidth(1);
    ctx.setStrokeStyle("rgba(15,15,15,1)");
    ctx.stroke();
  };
  drawBarAtX(noteStartX);
  for (let k = 1; k < barsPerRow; k++) drawBarAtX(noteStartX + (k / barsPerRow) * bandW);
  drawBarAtX(noteEndX);

  const layout: SystemLayout = {
    startSec,
    endSec,
    x0: noteStartX,
    x1: noteEndX,
    y0: staffTopY,
    y1: staffBottomY,
    segments: segments.map(({ startSec, endSec, x0, x1 }) => ({ startSec, endSec, x0, x1 })),
  };
  const nextY = (haveRhythm && rhyStave ? rhyStave : melStave).getBottomY();

  return { layout, nextY };
}
