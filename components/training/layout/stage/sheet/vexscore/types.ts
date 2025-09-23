// components/training/layout/sheet/vexscore/types.ts
import type { Phrase } from "@/utils/piano-roll/scale";
import type { RhythmEvent } from "@/utils/phrase/generator";

export type BarSegment = {
  startSec: number;
  endSec: number;
  /** Outer bar edges (barlines), used for strict musical time mapping. */
  x0: number;
  x1: number;
};

export type SystemLayout = {
  startSec: number; endSec: number;
  x0: number; x1: number;
  y0: number; y1: number;
  /** Piecewise-linear mapping (per bar, no manual padding). */
  segments?: BarSegment[];

  /** NEW: exact staff bands from VexFlow staves (pixels). */
  melY0?: number; // melody staff TOP line Y
  melY1?: number; // melody staff BOTTOM line Y
  rhyY0?: number; // rhythm staff TOP line Y (if present)
  rhyY1?: number; // rhythm staff BOTTOM line Y (if present)
};

export type LayoutPayload = {
  systems: SystemLayout[];
  total: { startSec: number; endSec: number; x0: number; x1: number; y0: number; y1: number };
};

export type VexScoreProps = {
  phrase: Phrase;
  lyrics?: string[];
  bpm?: number;
  den?: number;
  tsNum?: number;
  heightPx?: number;
  leadInSec?: number;
  useSharps?: boolean;
  clef?: "treble" | "bass";
  rhythm?: RhythmEvent[];
  melodyRhythm?: RhythmEvent[];
  onLayout?: (m: LayoutPayload) => void;
  className?: string;

  /** Key signature for the staves (e.g. "G", "Bb", "F#"). */
  keySig?: string | null;
};
