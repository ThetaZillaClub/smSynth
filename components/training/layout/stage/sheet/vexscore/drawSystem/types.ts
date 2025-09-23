import type { SystemLayout } from "../types";

export type TickPack = {
  ticks: any[];
  starts: number[];
  barIndex?: number[]; // absolute bar indices (from 0)
  tuplets?: any[];
  manualRests?: Array<{ note: any; start: number; barIndex?: number }>;
};

export type Selected = { t: any[]; s: number[]; i: number[] };

export type DrawParams = {
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

export type DrawReturn = {
  layout: SystemLayout;
  nextY: number;
};
