"use client";

export function usePitchTuneDurations({
  bpm,
  tsNum,
}: {
  bpm: number;
  tsNum: number;
}) {
  const quarterSec = 60 / bpm;
  const leadInSec = (tsNum * 60) / bpm; // visual-only lead-in (no ticks)
  const requiredHoldSec = Math.max(0.35, Math.min(quarterSec * 0.9, 0.6));

  return { quarterSec, leadInSec, requiredHoldSec };
}

export default usePitchTuneDurations;
