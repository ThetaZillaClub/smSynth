// components/training/layout/sheet/vexscore/drawSystem.ts
import { createStaves } from "./drawSystem/staves";
import { bandX, buildSegments, timeMath } from "./drawSystem/geom";
import { selectInWindow, dedupeSameStart, makeRelBarAt } from "./drawSystem/selection";
import {
  createVoices, placeTicks, computeBarShiftX, applyBarShift,
  buildBeamsFor, drawTickables, drawTuplets, drawManualRests, drawBarlines
} from "./drawSystem/draw";
import type { DrawParams, DrawReturn, TickPack } from "./drawSystem/types";
import type { SystemLayout } from "./types";

export function drawSystem(params: DrawParams): DrawReturn {
  const {
    ctx, padding, currentY, staffWidth, tsNum, den, clef, haveRhythm,
    systemWindow, mel, rhy, secPerBar, barsPerRow, keySig, isLastSystem = false
  } = params;

  const { startSec, endSec, contentEndSec } = systemWindow;
  const systemStartBar = Math.round(startSec / Math.max(1e-9, secPerBar));

  // 1) staves
  const { melStave, rhyStave } = createStaves({
    ctx, padding, currentY, staffWidth, tsNum, den, clef, haveRhythm, keySig, isLastSystem
  });

  // 2) geometry (band + per-bar segments + time helpers)
  const { noteStartX, noteEndX } = bandX(melStave);
  const segments = buildSegments(startSec, secPerBar, barsPerRow, noteStartX, noteEndX);
  const { eps, dupEps, downbeatEps, inWindow, barIndexOfTime, xAt } = timeMath({
    tsNum, secPerBar, startSec, endSec, contentEndSec, segments
  });

  // 3) select + dedupe
  let melSel = dedupeSameStart(selectInWindow(mel, inWindow), dupEps);
  const emptySel = { t: [] as any[], s: [] as number[], i: [] as number[] };
  let rhySel = (haveRhythm && rhyStave) ? dedupeSameStart(selectInWindow(rhy, inWindow), dupEps) : emptySel;

  // 4) bar-index helper relative to this system
  const relBarAt = makeRelBarAt({
    melSel, rhySel, barsPerRow, systemStartBar, barIndexOfTime, mel, rhy
  });

  // 5) voices + place X positions
  const { melVoice, rhyVoice } = createVoices(tsNum, den, melSel, (haveRhythm && rhyStave) ? rhySel : null);
  placeTicks(melSel.t, melSel.s, melStave, xAt, ctx, startSec);
  if (haveRhythm && rhyVoice && rhyStave) placeTicks(rhySel.t, rhySel.s, rhyStave, xAt, ctx, startSec);

  // 6) per-bar downbeat padding shift
  const barShiftX = computeBarShiftX({
    segments, melSel, relBarAt, mel, barsPerRow, tsNum, den, downbeatEps
  });
  applyBarShift(mel, melSel, barShiftX, relBarAt, xAt);
  if (haveRhythm && rhyVoice && rhyStave) applyBarShift(rhy, rhySel, barShiftX, relBarAt, xAt);

  // 7) beams + draw tickables/tuplets
  const melBeams = buildBeamsFor(melSel, mel, relBarAt);
  let rhyBeams: any[] = [];
  if (haveRhythm && rhyVoice && rhyStave) {
    rhyBeams = buildBeamsFor(rhySel, rhy, relBarAt);
  }

  drawTickables(melSel.t, melStave, ctx);
  melBeams.forEach((b: any) => b.setContext(ctx).draw());
  drawTuplets(mel.tuplets, melSel.t, ctx);

  if (haveRhythm && rhyStave) {
    drawTickables(rhySel.t, rhyStave, ctx);
    rhyBeams.forEach((b: any) => b.setContext(ctx).draw());
    drawTuplets(rhy.tuplets, rhySel.t, ctx);
  }

  // 8) manual rest glyphs
  drawManualRests(mel.manualRests, {
    ctx, stave: melStave, inWindow, voiceSel: melSel, dupEps, xAt,
    systemStartBar, barIndexOfTime, barsPerRow, barShiftX
  });
  if (haveRhythm && rhyStave) {
    drawManualRests(rhy.manualRests, {
      ctx, stave: rhyStave, inWindow, voiceSel: rhySel, dupEps, xAt,
      systemStartBar, barIndexOfTime, barsPerRow, barShiftX
    });
  }

  // 9) barlines (visual guides inside the band)
  const bottomStave = (haveRhythm && rhyStave) ? rhyStave : melStave;
  const { staffTopY, staffBottomY } = drawBarlines({
    ctx, topStave: melStave, bottomStave, noteStartX, noteEndX, barsPerRow, isLastSystem
  });

  // 10) layout return
  const layout: SystemLayout = {
    startSec,
    endSec,
    x0: noteStartX,
    x1: noteEndX,
    y0: staffTopY,
    y1: staffBottomY,
    segments: segments.map(({ startSec, endSec, x0, x1 }) => ({ startSec, endSec, x0, x1 })),
  };
  const nextY = bottomStave.getBottomY();

  return { layout, nextY };
}
