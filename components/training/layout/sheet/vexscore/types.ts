// components/training/layout/sheet/vexscore/types.ts
import type { Phrase } from "@/utils/piano-roll/scale";
import type { RhythmEvent } from "@/utils/phrase/generator";

export type BarSegment = {
  startSec: number;
  endSec: number;
  x0: number;
  x1: number;
};

export type SystemLayout = {
  startSec: number; endSec: number;
  x0: number; x1: number;
  y0: number; y1: number;
  /** Piecewise-linear mapping (per-bar) so overlays can match timing exactly. */
  segments?: BarSegment[];
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
  /** Shown as the blue rhythm staff (optional, independent of melody). */
  rhythm?: RhythmEvent[];
  /** Authoritative rhythm for the melody durations (optional, independent of the blue staff). */
  melodyRhythm?: RhythmEvent[];
  onLayout?: (
    m:
      | { noteStartX: number; noteEndX: number }
      | { systems: SystemLayout[]; total: { startSec: number; endSec: number; x0: number; x1: number; y0: number; y1: number } }
  ) => void;
  className?: string;
};
