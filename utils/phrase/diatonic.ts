// utils/phrase/diatonic.ts
import { hzToMidi } from "@/utils/pitch/pitchMath";
import type { Phrase } from "@/components/piano-roll/types";

export const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12] as const;

export function buildPhraseFromRangeDiatonic(
  lowHz: number,
  highHz: number,
  a4Hz = 440
): Phrase {
  const low = Math.round(hzToMidi(lowHz, a4Hz));
  const high = Math.round(hzToMidi(highHz, a4Hz));
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  const span = b - a;

  const dur = 0.5; // 8 notes => 4s window
  let mids: number[] = [];

  if (span >= 12) {
    const startMidi = Math.max(a, b - 12);
    mids = MAJOR_OFFSETS.map(off => startMidi + off);
  } else {
    mids = MAJOR_OFFSETS.map(off => {
      const ratio = off / 12;
      return Math.round(a + ratio * span);
    });
  }

  const notes = mids.map((m, i) => ({
    midi: m,
    startSec: i * dur,
    durSec: dur,
  }));

  return { durationSec: notes.length * dur, notes };
}
