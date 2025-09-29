// components/training/layout/stage/sheet/vexscore/drawSystem/geom.ts
import type { Stave } from "vexflow";

export type Segment = { startSec: number; endSec: number; x0: number; x1: number };

/** Some VexFlow builds expose these helpers on Stave; they’re not always in the types. */
type StaveNoteBand = {
  getNoteStartX?: () => number;
  getNoteEndX?: () => number;
};

export function bandX(melStave: Stave) {
  const s = melStave as unknown as Stave & StaveNoteBand;

  const noteStartX =
    typeof s.getNoteStartX === "function" ? s.getNoteStartX() : s.getX() + 48;

  const noteEndX =
    typeof s.getNoteEndX === "function" ? s.getNoteEndX() : s.getX() + s.getWidth() - 12;

  const bandW = Math.max(1, noteEndX - noteStartX);
  return { noteStartX, noteEndX, bandW };
}

export function buildSegments(
  startSec: number,
  secPerBar: number,
  barsPerRow: number,
  noteStartX: number,
  noteEndX: number
): Segment[] {
  const bandW = Math.max(1, noteEndX - noteStartX);
  const barW = bandW / barsPerRow;
  return Array.from({ length: barsPerRow }, (_, i) => ({
    startSec: startSec + i * secPerBar,
    endSec: startSec + (i + 1) * secPerBar,
    x0: noteStartX + i * barW,
    x1: noteStartX + (i + 1) * barW,
  }));
}

export function timeMath(args: {
  tsNum: number;
  secPerBar: number;
  startSec: number;
  endSec: number;
  contentEndSec: number;
  segments: Segment[];
}) {
  const { tsNum, secPerBar, startSec, endSec, contentEndSec, segments } = args;

  const eps = Math.max(1e-6, secPerBar / (tsNum * 512));
  const secPerBeat = secPerBar / tsNum;
  const downbeatEps = Math.max(1e-6, secPerBeat / 128);
  const dupEps = Math.max(1e-6, secPerBeat / 512);
  const windowEnd = Math.min(endSec, contentEndSec);

  const inWindow = (t0: number) => t0 >= startSec - eps && t0 < windowEnd - eps;

  const barIndexOfTime = (t0: number) => {
    const rel = Math.max(0, t0 - startSec);
    const idx = Math.floor((rel - eps) / secPerBar);
    return Math.max(0, Math.min(segments.length - 1, idx));
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

  return { eps, dupEps, downbeatEps, inWindow, barIndexOfTime, xAt };
}
