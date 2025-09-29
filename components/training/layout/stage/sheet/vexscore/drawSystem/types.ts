// components/training/layout/stage/sheet/vexscore/drawSystem/types.ts
import type { RenderContext, Tickable, Tuplet, StaveNote } from "vexflow";
import type { SystemLayout } from "../types";

export type TickPack = {
  /** VexFlow tickables in time order for this voice/system */
  ticks: Tickable[];
  /** Absolute start times (seconds) for each tickable (same length as `ticks`) */
  starts: number[];
  /** Optional absolute bar indices (0-based) for each tickable */
  barIndex?: number[];
  /** Tuplet groups created for these tickables */
  tuplets?: Tuplet[];
  /** Manual rest glyphs we place/draw independently of timing */
  manualRests?: Array<{ note: StaveNote; start: number; barIndex?: number }>;
};

export type Selected = {
  /** The subset of tickables that fall inside a system window */
  t: Tickable[];
  /** Their corresponding start times (sec) */
  s: number[];
  /** Indices into the original TickPack arrays */
  i: number[];
};

export type DrawParams = {
  ctx: RenderContext;
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

export type DrawReturn = {
  layout: SystemLayout;
  nextY: number;
};
