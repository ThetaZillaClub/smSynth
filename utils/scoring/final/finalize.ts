// utils/scoring/final/finalize.ts
import { letterFromPercent } from "../grade";

export function finalizeScore(pitchPercent: number, rhythmPercent: number) {
  let finalPct =
    (pitchPercent > 0 && rhythmPercent > 0)
      ? (2 * pitchPercent * rhythmPercent) / (pitchPercent + rhythmPercent)
      : Math.max(pitchPercent, rhythmPercent);

  if (pitchPercent >= 98 && rhythmPercent >= 98) finalPct = 100;

  return {
    percent: Math.max(0, Math.min(100, finalPct)),
    letter: letterFromPercent(finalPct),
  };
}
