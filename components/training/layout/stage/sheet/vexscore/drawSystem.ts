// components/training/layout/sheet/vexscore/drawSystem.ts
import { createStaves } from "./drawSystem/staves";
import { bandX, buildSegments, timeMath } from "./drawSystem/geom";
import { selectInWindow, dedupeSameStart, makeRelBarAt } from "./drawSystem/selection";
import {
  createVoices,
  placeTicks,
  computeBarShiftX,
  applyBarShift,
  buildBeamsFor,
  drawTickables,
  drawTuplets,
  drawManualRests,
  drawBarlines,
} from "./drawSystem/draw";
import type { DrawParams, DrawReturn, Selected } from "./drawSystem/types";
import type { SystemLayout } from "./types";
import type { Beam } from "vexflow";

/** Helper type to avoid `any`: derive the tick-like type from `placeTicks` */
type TickLike = Parameters<typeof placeTicks>[0][number];
const toTickLikes = (t: Selected["t"]) => t as unknown as TickLike[];

export function drawSystem(params: DrawParams): DrawReturn {
  const {
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
  } = params;

  const { startSec, endSec, contentEndSec } = systemWindow;
  const systemStartBar = Math.round(startSec / Math.max(1e-9, secPerBar));

  // 1) staves
  const { melStave, rhyStave } = createStaves({
    ctx,
    padding,
    currentY,
    staffWidth,
    tsNum,
    den,
    clef,
    haveRhythm,
    keySig,
    isLastSystem,
  });

  // Capture exact staff bands from VexFlow staves
  const melY0 = melStave.getYForLine(0);
  const melY1 = melStave.getYForLine(4);
  const rhyY0 = rhyStave ? rhyStave.getYForLine(0) : undefined;
  const rhyY1 = rhyStave ? rhyStave.getYForLine(4) : undefined;

  // 2) geometry (band + per-bar segments + time helpers)
  const { noteStartX, noteEndX } = bandX(melStave);
  const segments = buildSegments(startSec, secPerBar, barsPerRow, noteStartX, noteEndX);
  const { dupEps, downbeatEps, inWindow, barIndexOfTime, xAt } = timeMath({
    tsNum,
    secPerBar,
    startSec,
    endSec,
    contentEndSec,
    segments,
  });

  // 3) select + dedupe
  const melSel = dedupeSameStart(selectInWindow(mel, inWindow), dupEps);
  const emptySel: Selected = { t: [], s: [], i: [] };
  const rhySel =
    haveRhythm && rhyStave ? dedupeSameStart(selectInWindow(rhy, inWindow), dupEps) : emptySel;

  // 4) bar-index helper relative to this system
  const relBarAt = makeRelBarAt({
    melSel,
    rhySel,
    barsPerRow,
    systemStartBar,
    barIndexOfTime,
    mel,
    rhy,
  });

  // 5) voices + place X positions (we only need rhyVoice reference later)
  const { rhyVoice } = createVoices(tsNum, den, melSel, haveRhythm && rhyStave ? rhySel : null);
  placeTicks(toTickLikes(melSel.t), melSel.s, melStave, xAt, ctx, startSec);
  if (haveRhythm && rhyVoice && rhyStave) {
    placeTicks(toTickLikes(rhySel.t), rhySel.s, rhyStave, xAt, ctx, startSec);
  }

  // 6) per-bar downbeat padding shift
  const barShiftX = computeBarShiftX({
    segments,
    melSel,
    relBarAt,
    mel,
    barsPerRow,
    tsNum,
    den,
    downbeatEps,
  });
  applyBarShift(mel, melSel, barShiftX, relBarAt, xAt);
  if (haveRhythm && rhyVoice && rhyStave) applyBarShift(rhy, rhySel, barShiftX, relBarAt, xAt);

  // 7) beams + draw tickables/tuplets
  const melBeams = buildBeamsFor(melSel, mel, relBarAt) as unknown as Beam[];
  let rhyBeams: Beam[] = [];
  if (haveRhythm && rhyVoice && rhyStave) {
    rhyBeams = buildBeamsFor(rhySel, rhy, relBarAt) as unknown as Beam[];
  }

  drawTickables(toTickLikes(melSel.t), melStave, ctx);
  melBeams.forEach((b) => b.setContext(ctx).draw());
  drawTuplets(mel.tuplets, toTickLikes(melSel.t), ctx);

  if (haveRhythm && rhyStave) {
    drawTickables(toTickLikes(rhySel.t), rhyStave, ctx);
    rhyBeams.forEach((b) => b.setContext(ctx).draw());
    drawTuplets(rhy.tuplets, toTickLikes(rhySel.t), ctx);
  }

  // 8) manual rest glyphs
  drawManualRests(mel.manualRests, {
    ctx,
    stave: melStave,
    inWindow,
    voiceSel: melSel,
    dupEps,
    xAt,
    systemStartBar,
    barIndexOfTime,
    barsPerRow,
    barShiftX,
  });
  if (haveRhythm && rhyStave) {
    drawManualRests(rhy.manualRests, {
      ctx,
      stave: rhyStave,
      inWindow,
      voiceSel: rhySel,
      dupEps,
      xAt,
      systemStartBar,
      barIndexOfTime,
      barsPerRow,
      barShiftX,
    });
  }

  // 9) barlines (visual guides inside the band)
  const bottomStave = haveRhythm && rhyStave ? rhyStave : melStave;
  const { staffTopY, staffBottomY } = drawBarlines({
    ctx,
    topStave: melStave,
    bottomStave,
    noteStartX,
    noteEndX,
    barsPerRow,
    isLastSystem,
  });

  // 10) layout return (now includes precise staff bands)
  const layout: SystemLayout = {
    startSec,
    endSec,
    x0: noteStartX,
    x1: noteEndX,
    y0: staffTopY,
    y1: staffBottomY,
    segments: segments.map(({ startSec, endSec, x0, x1 }) => ({ startSec, endSec, x0, x1 })),
    melY0,
    melY1,
    rhyY0,
    rhyY1,
  };
  const nextY = bottomStave.getBottomY();

  return { layout, nextY };
}
