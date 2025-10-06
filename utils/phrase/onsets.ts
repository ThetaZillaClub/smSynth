// utils/phrase/onsets.ts
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { noteValueToSeconds } from "@/utils/time/tempo";

/** Turn a rhythm fabric into onset times (seconds) for scoring alignment. */
export function makeOnsetsFromRhythm(
  rhythm: RhythmEvent[] | null | undefined,
  bpm: number,
  den: number
): number[] {
  if (!rhythm?.length) return [];
  const out: number[] = [];
  let t = 0;
  for (const ev of rhythm) {
    const dur = noteValueToSeconds(ev.value, bpm, den);
    if (ev.type === "note") out.push(t);
    t += dur;
  }
  return out;
}
