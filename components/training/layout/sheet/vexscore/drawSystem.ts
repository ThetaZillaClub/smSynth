// components/training/layout/sheet/vexscore/drawSystem.ts
import { Stave, StaveConnector, Voice, Formatter } from "vexflow";
import { BARS_PER_ROW, STAFF_GAP_Y } from "./layout";
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
  mel: { ticks: any[]; starts: number[] }; // may also carry mel.tuplets (accessed via any)
  rhy: { ticks: any[]; starts: number[]; tuplets: any[] };
  secPerBar: number;
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
}: DrawParams) {
  const { startSec, endSec, contentEndSec } = systemWindow;

  // create staves
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

  // ---- robust time helpers (no compression, exact bar spans) ----
  const noteStartX =
    typeof (melStave as any).getNoteStartX === "function"
      ? (melStave as any).getNoteStartX()
      : melStave.getX() + 48;
  const noteEndX =
    typeof (melStave as any).getNoteEndX === "function"
      ? (melStave as any).getNoteEndX()
      : melStave.getX() + melStave.getWidth() - 12;
  const bandW = Math.max(1, noteEndX - noteStartX);
  const barW = bandW / BARS_PER_ROW;

  // small tolerance to tame float drift (e.g., 1/256 of a beat per bar)
  const eps = Math.max(1e-6, secPerBar / (tsNum * 256));

  const inWindow = (t0: number) => t0 >= startSec - eps && t0 < contentEndSec - eps;

  const barIndexOf = (t0: number) => {
    const rel = t0 - startSec;
    let idx = Math.floor((rel + eps) / secPerBar);
    if (idx < 0) idx = 0;
    if (idx >= BARS_PER_ROW) idx = BARS_PER_ROW - 1;
    return idx;
  };

  const xAt = (t0: number) => {
    const idx = barIndexOf(t0);
    const bStart = startSec + idx * secPerBar;
    // normalized time inside the bar (0..1), clamped with epsilon forgiveness
    let u = (t0 - bStart) / secPerBar;
    if (u < 0 && u > -eps) u = 0;
    if (u > 1 && u < 1 + eps) u = 1;
    u = Math.max(0, Math.min(1, u));
    return noteStartX + idx * barW + u * barW;
  };

  // filter tickables strictly by system content window (no compression)
  const sel = (ticks: any[], starts: number[]) => {
    const outT: any[] = [];
    const outS: number[] = [];
    for (let i = 0; i < ticks.length; i++) {
      const t0 = starts[i];
      if (inWindow(t0)) {
        outT.push(ticks[i]);
        outS.push(t0);
      }
    }
    return { t: outT, s: outS };
  };
  const melSel = sel(mel.ticks, mel.starts);
  const rhySel =
    haveRhythm && rhyStave ? sel(rhy.ticks, rhy.starts) : { t: [] as any[], s: [] as number[] };

  // >>> Force all MELODY stems UP before formatting / beaming.
  for (const n of melSel.t) {
    if (typeof (n as any)?.setStemDirection === "function") {
      (n as any).setStemDirection(1); // 1 = UP, -1 = DOWN
    }
  }

  // voices + auto layout (we'll override tickcontext X shortly)
  const melVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
  melVoice.addTickables(melSel.t as any);
  new Formatter({ softmaxFactor: 5 }).joinVoices([melVoice]).formatToStave([melVoice], melStave);

  let rhyVoice: Voice | null = null;
  if (haveRhythm && rhyStave) {
    rhyVoice = new Voice({ numBeats: tsNum, beatValue: den }).setStrict(false);
    rhyVoice.addTickables(rhySel.t as any);
    new Formatter({ softmaxFactor: 5 }).joinVoices([rhyVoice]).formatToStave([rhyVoice], rhyStave);
  }

  // pin tickcontexts to time-true X (no head-shift)
  for (let i = 0; i < melSel.t.length; i++) {
    const tc = (melSel.t[i] as any).getTickContext?.();
    if (tc?.setX) tc.setX(xAt(melSel.s[i] ?? startSec));
  }
  if (haveRhythm && rhyVoice && rhyStave) {
    for (let i = 0; i < rhySel.t.length; i++) {
      const tc = (rhySel.t[i] as any).getTickContext?.();
      if (tc?.setX) tc.setX(xAt(rhySel.s[i] ?? startSec));
    }
  }

  // build beams BEFORE drawing (suppresses flags on beamed notes)
  const melGroupKeys = melSel.s.map((t0) => barIndexOf(t0));
  const melBeams = buildBeams(melSel.t, {
    groupKeys: melGroupKeys,
    allowMixed: true,
    sameStemOnly: true, // harmless (all stems are up now)
  });

  let rhyBeams: any[] = [];
  if (haveRhythm && rhyVoice && rhyStave) {
    const rhyGroupKeys = rhySel.s.map((t0) => barIndexOf(t0));
    rhyBeams = buildBeams(rhySel.t, { groupKeys: rhyGroupKeys, allowMixed: true, sameStemOnly: true });
  }

  // draw notes, beams, tuplets
  melVoice.draw(ctx, melStave);
  melBeams.forEach((b) => b.setContext(ctx).draw());
  const melTuplets = (mel as any).tuplets || [];
  melTuplets.forEach((t: any) => t.setContext(ctx).draw());

  if (haveRhythm && rhyVoice && rhyStave) {
    rhyVoice.draw(ctx, rhyStave);
    rhyBeams.forEach((b) => b.setContext(ctx).draw());
    (rhy.tuplets || []).forEach((t: any) => t.setContext(ctx).draw());
  }

  // barlines (4 equal segments per row)
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
  drawBarAtX(noteStartX);
  for (let k = 1; k < BARS_PER_ROW; k++) drawBarAtX(noteStartX + (k / BARS_PER_ROW) * bandW);
  drawBarAtX(noteEndX);

  const layout: SystemLayout = {
    startSec,
    endSec,
    x0: noteStartX,
    x1: noteEndX,
    y0: staffTopY,
    y1: staffBottomY,
  };
  const nextY = (haveRhythm && rhyStave ? rhyStave : melStave).getBottomY();

  return { layout, nextY };
}
