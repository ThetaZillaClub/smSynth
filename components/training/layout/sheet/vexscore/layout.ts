// components/training/layout/sheet/vexscore/layout.ts

export const BARS_PER_ROW = 4;
export const STAFF_GAP_Y  = 14;
export const SYSTEM_GAP_Y = 28;
export const EST_STAVE_H  = 80;

export function computeSystems(totalSec: number, secPerBar: number) {
  const totalBarsFloat = totalSec / secPerBar;
  const totalBarsCeil = Math.ceil(totalBarsFloat - 1e-9);

  const out: Array<{
    startBar: number;
    endBar: number;
    startSec: number;
    endSec: number;
    contentEndSec: number;
  }> = [];

  for (let b = 0; b < totalBarsCeil; b += BARS_PER_ROW) {
    const startBar = b;
    const endBar = startBar + BARS_PER_ROW;
    const startSec = startBar * secPerBar;
    const endSec = startSec + BARS_PER_ROW * secPerBar;
    const realEndBar = Math.min(totalBarsCeil, endBar);
    const contentEndSec = Math.min(totalSec, realEndBar * secPerBar);
    out.push({ startBar, endBar, startSec, endSec, contentEndSec });
  }

  if (out.length === 0) {
    out.push({ startBar: 0, endBar: BARS_PER_ROW, startSec: 0, endSec: BARS_PER_ROW * secPerBar, contentEndSec: totalSec });
  }
  return out;
}
