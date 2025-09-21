// components/training/layout/sheet/vexscore/layout.ts

export const STAFF_GAP_Y  = 14;
export const SYSTEM_GAP_Y = 28;
export const EST_STAVE_H  = 80;

export type BarsPerRow = 2 | 3 | 4;

type SystemsOpts = {
  /** Melody tickable start times (seconds), used to gauge bar density on the first row */
  melodyStarts?: number[];
  /** Choose at most this many bars per row (default 4). We will downgrade to 3 or 2 if dense. */
  maxBarsPerRow?: BarsPerRow;
};

/** Count how many events fall into each bar. */
function barCounts(totalBars: number, secPerBar: number, starts: number[]) {
  const counts = Array(totalBars).fill(0);
  for (const t of starts) {
    if (t < 0) continue;
    const b = Math.floor(t / Math.max(1e-9, secPerBar));
    if (b >= 0 && b < totalBars) counts[b]++;
  }
  return counts;
}

/** Decide 4→3→2 bars-per-row from the *first row* density; stick with it for the whole score. */
function decideBarsPerRow(
  totalBars: number,
  secPerBar: number,
  starts: number[],
  maxBars: BarsPerRow = 4
): BarsPerRow {
  if (!totalBars) return (maxBars === 2 ? 2 : maxBars === 3 ? 3 : 4);

  const counts = barCounts(totalBars, secPerBar, starts);

  // how dense is the *first* row up to maxBars?
  const firstRowBars = (maxBars <= totalBars ? maxBars : (totalBars >= 4 ? 4 : (totalBars >= 3 ? 3 : 2))) as BarsPerRow;
  let maxInFirstRow = 0;
  for (let i = 0; i < firstRowBars; i++) maxInFirstRow = Math.max(maxInFirstRow, counts[i] || 0);

  // thresholds
  if (maxInFirstRow >= 12) return 2;
  if (maxInFirstRow >= 8)  return (maxBars === 2 ? 2 : 3);
  return (maxBars === 2 ? 2 : maxBars === 3 ? 3 : 4);
}

/** Build systems using a single bars-per-row choice across the whole piece. */
export function computeSystems(
  totalSec: number,
  secPerBar: number,
  opts: SystemsOpts = {}
): {
  systems: Array<{
    startBar: number;
    endBar: number;
    startSec: number;
    endSec: number;
    contentEndSec: number;
  }>;
  barsPerRow: BarsPerRow;
} {
  const totalBarsFloat = totalSec / Math.max(1e-9, secPerBar);
  const totalBarsCeil = Math.ceil(totalBarsFloat - 1e-9);

  const chosenBarsPerRow: BarsPerRow = decideBarsPerRow(
    totalBarsCeil,
    secPerBar,
    opts.melodyStarts ?? [],
    opts.maxBarsPerRow ?? 4
  );

  const systems: Array<{
    startBar: number;
    endBar: number;
    startSec: number;
    endSec: number;
    contentEndSec: number;
  }> = [];

  const step: BarsPerRow = chosenBarsPerRow;
  for (let b = 0; b < Math.max(1, totalBarsCeil); b += step) {
    const startBar = b;
    const endBar = startBar + step;
    const startSec = startBar * secPerBar;
    const endSec = startSec + step * secPerBar;
    const realEndBar = Math.min(totalBarsCeil, endBar);
    const contentEndSec = Math.min(totalSec, realEndBar * secPerBar);
    systems.push({ startBar, endBar, startSec, endSec, contentEndSec });
  }

  return { systems, barsPerRow: chosenBarsPerRow };
}
