// hooks/lyrics/usePhraseLyrics.ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { Phrase } from "@/utils/piano-roll/scale";
import { makeWordLyricVariant } from "@/utils/lyrics/wordBank";
import { hzToMidi } from "@/utils/pitch/pitchMath";

/**
 * Legacy generator used only as a fallback when the new scale/rhythm
 * path isn’t active. It no longer imports the old diatonic builder.
 *
 * It creates a simple, deterministic, *range-aware* zig-zag phrase:
 * - Picks a center MIDI in [low..high]
 * - Walks up/down in 1–2 semitone steps (bounded in range)
 * - Number of notes scales with noteDurSec (shorter notes => more)
 */
function buildFallbackRangePhrase(
  lowHz: number,
  highHz: number,
  a4Hz: number,
  noteDurSec: number,
  seed: number
): Phrase {
  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz), a4Hz));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz), a4Hz));
  const lo = Math.min(loM, hiM);
  const hi = Math.max(loM, hiM);

  if (hi <= lo) {
    return { durationSec: Math.max(0.25, noteDurSec), notes: [] };
  }

  // Size notes heuristically: aim for ~3–6 seconds total by default,
  // scaled by provided noteDurSec; clamp to [6..48] to avoid extremes.
  const targetSec = 4.0; // center on ~4s phrase by default
  const N = Math.max(6, Math.min(48, Math.round(targetSec / Math.max(0.05, noteDurSec))));

  // Tiny PRNG (xorshift32)
  let x = seed >>> 0;
  const rnd = () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 0xffffffff;
  };

  // Start near the center of the window
  const mid = Math.round((lo + hi) / 2);
  let cur = Math.min(hi, Math.max(lo, mid));

  // Build a bounded zig-zag with 1–2 semitone steps
  let t = 0;
  const notes: { midi: number; startSec: number; durSec: number }[] = [];
  let dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;

  for (let i = 0; i < N; i++) {
    notes.push({ midi: cur, startSec: t, durSec: noteDurSec });
    t += noteDurSec;

    const stepRaw = 1 + (rnd() < 0.35 ? 1 : 0); // mostly 1, sometimes 2
    let next = cur + dir * stepRaw;

    // Bounce at edges
    if (next < lo) {
      dir = 1;
      next = cur + dir * stepRaw;
    } else if (next > hi) {
      dir = -1;
      next = cur + dir * stepRaw;
    }

    cur = Math.min(hi, Math.max(lo, next));
  }

  return { durationSec: t, notes };
}

type Options = {
  lowHz: number | null;
  highHz: number | null;
  lyricStrategy: "mixed" | "stableVowel";
  a4Hz?: number;
  noteDurSec?: number;
};

export default function usePhraseLyrics(opts: Options) {
  const { lowHz, highHz, lyricStrategy, a4Hz = 440, noteDurSec = 0.5 } = opts;

  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [words, setWords] = useState<string[] | null>(null);

  // 32-bit seeds (unsigned)
  const phraseSeedRef = useRef<number>((crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0));
  const lyricSeedRef  = useRef<number>((crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0));

  /** Reset seeds and (re)compute phrase/words for a new session */
  const reset = useCallback(() => {
    if (lowHz == null || highHz == null) {
      setPhrase(null);
      setWords(null);
      return;
    }

    phraseSeedRef.current = (crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0);
    lyricSeedRef.current  = (crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0);

    const p = buildFallbackRangePhrase(lowHz, highHz, a4Hz, noteDurSec, phraseSeedRef.current);
    const w = makeWordLyricVariant(p.notes.length, lyricStrategy, lyricSeedRef.current);

    setPhrase(p);
    setWords(w);
  }, [lowHz, highHz, lyricStrategy, a4Hz, noteDurSec]);

  /** Advance seeds and compute the “next” phrase/words (used after recording finishes) */
  const advance = useCallback(() => {
    if (lowHz == null || highHz == null) return;

    phraseSeedRef.current = (phraseSeedRef.current + 1) >>> 0;
    const nextPhrase = buildFallbackRangePhrase(lowHz, highHz, a4Hz, noteDurSec, phraseSeedRef.current);

    lyricSeedRef.current = (lyricSeedRef.current + 1) >>> 0;
    const nextWords = makeWordLyricVariant(nextPhrase.notes.length, lyricStrategy, lyricSeedRef.current);

    setPhrase(nextPhrase);
    setWords(nextWords);
  }, [lowHz, highHz, lyricStrategy, a4Hz, noteDurSec]);

  /** Current lyric seed for metadata */
  const getLyricSeed = useCallback(() => lyricSeedRef.current, []);

  return { phrase, words, reset, advance, getLyricSeed };
}
