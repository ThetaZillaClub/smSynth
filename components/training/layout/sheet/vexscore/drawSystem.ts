// components/training/layout/sheet/vexscore/drawSystem.ts
import { Stave, StaveConnector, Voice, Formatter, Barline, TickContext } from "vexflow";
import { STAFF_GAP_Y } from "./layout";
import { buildBeams } from "./builders";
import type { SystemLayout } from "./types";

type TickPack = {
  ticks: any[];
  starts: number[];
  barIndex?: number[];  // absolute bar indices (from 0)
  tuplets?: any[];
  manualRests?: Array<{ note: any; start: number; barIndex?: number }>;
};

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
  mel: TickPack;
  rhy: TickPack;
  secPerBar: number;
  barsPerRow: 4 | 3 | 2;
  /** VexFlow key signature name (e.g., "Bb", "F#", "C"). */
  keySig?: string | null;
  /** If true, draw a FINAL (thin+thick) double barline at the far right. */
  isLastSystem?: boolean;
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
  keySig,
  isLastSystem = false,
}: DrawParams) {
  const { startSec, endSec, contentEndSec } = systemWindow;
  const systemStartBar = Math.round(startSec / Math.max(1e-9, secPerBar)); // NEW

  // ----- staves -----
  const melStave = new Stave(padding.left, currentY, staffWidth);
  melStave.setClef(clef);
  if (keySig) melStave.addKeySignature(keySig);
  melStave.addTimeSignature(`${tsNum}/${den}`);
  melStave.setEndBarType(isLastSystem ? Barline.type.END : Barline.type.SINGLE);
  melStave.setContext(ctx).draw();

  let rhyStave: Stave | null = null;
  if (haveRhythm) {
    const yR = melStave.getBottomY() + STAFF_GAP_Y;
    rhyStave = new Stave(padding.left, yR, staffWidth);
    rhyStave.setClef("bass");
    if (keySig) rhyStave.addKeySignature(keySig);
    rhyStave.addTimeSignature(`${tsNum}/${den}`);
    rhyStave.setEndBarType(isLastSystem ? Barline.type.END : Barline.type.SINGLE);
    rhyStave.setContext(ctx).draw();

    new StaveConnector(melStave, rhyStave).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
    new StaveConnector(melStave, rhyStave).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
    new StaveConnector(melStave, rhyStave)
      .setType(isLastSystem ? StaveConnector.type.BOLD_DOUBLE_RIGHT : StaveConnector.type.SINGLE_RIGHT)
      .setContext(ctx)
      .draw();
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

  const eps = Math.max(1e-6, secPerBar / (tsNum * 512));
  const secPerBeat = secPerBar / tsNum;
  const downbeatEps = Math.max(1e-6, secPerBeat / 128);
  const dupEps = Math.max(1e-6, secPerBeat / 512);

  const windowEnd = Math.min(endSec, contentEndSec);

  const segments = Array.from({ length: barsPerRow }, (_, i) => {
    const segStartSec = startSec + i * secPerBar;
    const segEndSec = segStartSec + secPerBar;
    const barX0 = noteStartX + i * barW;
    const barX1 = noteStartX + (i + 1) * barW;
    return { startSec: segStartSec, endSec: segEndSec, x0: barX0, x1: barX1 };
  });

  const inWindow = (t0: number) => t0 >= startSec - eps && t0 < windowEnd - eps;

  const barIndexOfTime = (t0: number) => {
    const rel = Math.max(0, t0 - startSec);
    let idx = Math.floor((rel - eps) / secPerBar); // bias left near boundaries
    if (idx < 0) idx = 0;
    if (idx >= barsPerRow) idx = barsPerRow - 1;
    return idx;
  };

  const xAt = (t0: number) => {
    const idx = barIndexOfTime(t0);
    const seg = segments[idx];
    const dur = Math.max(1e-6, seg.endSec - seg.startSec);
    let u = (t0 - seg.startSec) / dur;
    if (u < 0 && u > -eps) u = 0;
    if (u > 1 && u < 1 + eps) u = 1;
    u = Math.max(0, Math.min(1, u));
    return seg.x0 + u * (seg.x1 - seg.x0);
  };

  // Select items in this window AND keep original indices for bar lookup
  const sel = (pack: TickPack) => {
    const outT: any[] = [], outS: number[] = [], outI: number[] = [];
    for (let i = 0; i < pack.ticks.length; i++) {
      const t0 = pack.starts[i];
      if (inWindow(t0)) { outT.push(pack.ticks[i]); outS.push(t0); outI.push(i); }
    }
    return { t: outT, s: outS, i: outI };
  };
  let melSel = sel(mel);
  let rhySel = haveRhythm && rhyStave ? sel(rhy) : { t: [] as any[], s: [] as number[], i: [] as number[] };

  const isRestish = (note: any): boolean => {
    // treat both rests and ghostnotes as "restish"
    if (typeof note?.isRest === "function" && note.isRest()) return true;
    const d = note?.getDuration?.();
    if (typeof d === "string" && d.endsWith("r")) return true;
    const cat = typeof note?.getCategory === "function" ? note.getCategory() : "";
    if (typeof cat === "string" && cat.toLowerCase().includes("ghost")) return true;
    return false;
  };

  const dedupeSameStart = (selObj: { t: any[]; s: number[]; i: number[] }) => {
    const T = selObj.t, S = selObj.s, I = selObj.i;
    if (T.length <= 1) return selObj;
    const outT: any[] = [], outS: number[] = [], outI: number[] = [];
    for (let k = 0; k < T.length; k++) {
      const curT = T[k], curS = S[k], curI = I[k];
      if (!outS.length) { outT.push(curT); outS.push(curS); outI.push(curI); continue; }
      const j = outS.length - 1;
      if (Math.abs(curS - outS[j]) <= dupEps) {
        const keepIncoming = isRestish(outT[j]) && !isRestish(curT);
        if (keepIncoming) { outT[j] = curT; outS[j] = curS; outI[j] = curI; }
      } else {
        outT.push(curT); outS.push(curS); outI.push(curI);
      }
    }
    return { t: outT, s: outS, i: outI };
  };

  melSel = dedupeSameStart(melSel);
  if (haveRhythm && rhyStave) rhySel = dedupeSameStart(rhySel);

  // ---- helpers to get *relative* bar index from carried absolute barIndex
  const relBarAt = (pack: TickPack, selIdx: number): number => {
    const orig = (pack === mel ? melSel : rhySel).i[selIdx];
    const abs = pack.barIndex?.[orig];
    if (typeof abs === "number") {
      return Math.max(0, Math.min(barsPerRow - 1, abs - systemStartBar));
    }
    // fallback to time
    return barIndexOfTime((pack === mel ? melSel : rhySel).s[selIdx]);
  };

  // voices (for beaming/tuplets only; we'll override X later)
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

  const placeTicks = (ticks: any[], starts: number[], stave: Stave) => {
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
  };
  placeTicks(melSel.t, melSel.s, melStave);
  if (haveRhythm && rhyVoice && rhyStave) placeTicks(rhySel.t, rhySel.s, rhyStave);

  const leftMostX = (n: any): number => {
    try {
      if (!isRestish(n) && typeof n.getNoteHeadBeginX === "function") return n.getNoteHeadBeginX();
      const bb = typeof n.getBoundingBox === "function" ? n.getBoundingBox() : null;
      if (bb) return bb.getX();
      const m = n.getMetrics?.();
      const w = (m?.noteHeadWidth && m.noteHeadWidth > 0) ? m.noteHeadWidth : 10;
      const ax = typeof n.getAbsoluteX === "function" ? n.getAbsoluteX() : (n.getTickContext?.().getX?.() ?? 0);
      return ax - w * 0.5;
    } catch { return 0; }
  };

  const densityOfBar = (bRel: number) => {
    let c = 0;
    for (let i = 0; i < melSel.t.length; i++) {
      if (relBarAt(mel, i) === bRel) c++;
    }
    return c;
  };

  const barShiftX: number[] = Array(barsPerRow).fill(0);

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

  const applyBarShift = (pack: TickPack, selObj: { t: any[]; s: number[]; i: number[] }) => {
    for (let i = 0; i < selObj.t.length; i++) {
      const n = selObj.t[i] as any;
      const bRel = relBarAt(pack, i);
      const dx = barShiftX[bRel] || 0;
      if (!dx) continue;
      const tc = n.getTickContext?.();
      if (tc?.setX) tc.setX((tc.getX?.() ?? xAt(selObj.s[i])) + dx);
      if (tc) { (tc as any).preFormatted = true; (tc as any).postFormatted = true; }
    }
  };
  applyBarShift(mel, melSel);
  if (haveRhythm && rhyVoice && rhyStave) applyBarShift(rhy, rhySel);

  const melGroupKeys = melSel.i.map((_, k) => relBarAt(mel, k));
  const melBeams = buildBeams(melSel.t, { groupKeys: melGroupKeys, allowMixed: true, sameStemOnly: true });
  let rhyBeams: any[] = [];
  if (haveRhythm && rhyVoice && rhyStave) {
    const rhyGroupKeys = rhySel.i.map((_, k) => relBarAt(rhy, k));
    rhyBeams = buildBeams(rhySel.t, { groupKeys: rhyGroupKeys, allowMixed: true, sameStemOnly: true });
  }

  const drawTickables = (ticks: any[], stave: Stave) => {
    for (const t of ticks) {
      if (typeof t.setStave === "function") t.setStave(stave);
      if (typeof t.setContext === "function") t.setContext(ctx);
      if (typeof t.draw === "function") t.draw();
    }
  };
  drawTickables(melSel.t, melStave);
  melBeams.forEach((b) => b.setContext(ctx).draw());

  const tupletFullyInside = (tp: any, pool: any[]) => {
    const notes = typeof tp.getNotes === "function" ? tp.getNotes() : [];
    return notes.length > 0 && notes.every((n: any) => pool.includes(n));
  };
  (mel.tuplets || [])
    .filter((t: any) => tupletFullyInside(t, melSel.t))
    .forEach((t: any) => t.setContext(ctx).draw());

  if (haveRhythm && rhyStave) {
    drawTickables(rhySel.t, rhyStave);
    rhyBeams.forEach((b) => b.setContext(ctx).draw());
    (rhy.tuplets || [])
      .filter((t: any) => tupletFullyInside(t, rhySel.t))
      .forEach((t: any) => t.setContext(ctx).draw());
  }

  // ---- Draw manual REST glyphs at custom X (outside VexFlow spacing) ----
  const drawManualRests = (
    list: Array<{ note: any; start: number; barIndex?: number }> | undefined,
    stave: Stave,
    voiceSel: { t: any[]; s: number[]; i: number[] }
  ) => {
    if (!list?.length) return;
    for (const { note, start, barIndex } of list) {
      if (!inWindow(start)) continue;

      // Hide manual rest if a non-rest/ghost tickable occurs at the same start.
      let suppress = false;
      for (let i = 0; i < voiceSel.t.length; i++) {
        if (Math.abs(voiceSel.s[i] - start) <= dupEps && !isRestish(voiceSel.t[i])) {
          suppress = true;
          break;
        }
      }
      if (suppress) continue;

      const absBar = (typeof barIndex === "number") ? barIndex : systemStartBar + barIndexOfTime(start);
      const bRel = Math.max(0, Math.min(barsPerRow - 1, absBar - systemStartBar));
      const x = xAt(start) + (barShiftX[bRel] || 0);

      // Make sure VexFlow spacing doesn't try to manage this glyph.
      note.setCenterAlignment?.(false);
      note.setCenterAligned?.(false);
      (note as any).center_alignment = false;
      note.setIgnoreTicks?.(true);
      (note as any).ignore_ticks = true;

      // Stave & context first (dots/placement need them).
      if (typeof note.setStave === "function") note.setStave(stave);
      if (typeof note.setContext === "function") note.setContext(ctx);

      // Provide a TickContext so draw() can compute absolute X safely.
      const tc = new TickContext();
      tc.addTickable(note);
      tc.preFormat();
      tc.setX(x);
      note.setTickContext?.(tc);

      // Preformatted so VexFlow won’t move it.
      if (typeof note.setPreFormatted === "function") note.setPreFormatted(true);
      else (note as any).preFormatted = true;

      if (typeof note.draw === "function") note.draw();
    }
  };

  drawManualRests(mel.manualRests, melStave, melSel);
  if (haveRhythm && rhyStave) drawManualRests(rhy.manualRests, rhyStave, rhySel);

  // ---- Barline drawing (visual guides INSIDE the system band) ----
  const staffTopY = melStave.getYForLine(0);
  const staffBottomY = (haveRhythm && rhyStave ? rhyStave : melStave).getYForLine(4);
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

  drawBarAtX(noteStartX);
  for (let k = 1; k < barsPerRow; k++) drawBarAtX(noteStartX + (k / barsPerRow) * bandW);
  if (!isLastSystem) drawBarAtX(noteEndX);

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
