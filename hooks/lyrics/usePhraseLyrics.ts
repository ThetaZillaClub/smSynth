// hooks/lyrics/usePhraseLyrics.ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { Phrase } from "@/utils/piano-roll/scale";
import { buildPhraseFromRangeDiatonicVariant } from "@/utils/phrase/diatonic";
import { makeWordLyricVariant } from "@/utils/lyrics/wordBank";

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
  const lyricSeedRef = useRef<number>((crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0));

  /** Reset seeds and (re)compute phrase/words for a new session */
  const reset = useCallback(() => {
    if (lowHz == null || highHz == null) {
      setPhrase(null);
      setWords(null);
      return;
    }

    phraseSeedRef.current = (crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0);
    lyricSeedRef.current = (crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0);

    const p = buildPhraseFromRangeDiatonicVariant(lowHz, highHz, a4Hz, noteDurSec, phraseSeedRef.current);
    // Ensure 1:1 alignment between notes and words
    const w = makeWordLyricVariant(p.notes.length, lyricStrategy, lyricSeedRef.current);

    setPhrase(p);
    setWords(w);
  }, [lowHz, highHz, lyricStrategy, a4Hz, noteDurSec]);

  /** Advance seeds and compute the “next” phrase/words (used after recording finishes) */
  const advance = useCallback(() => {
    if (lowHz == null || highHz == null) return;

    phraseSeedRef.current = (phraseSeedRef.current + 1) >>> 0;
    const nextPhrase = buildPhraseFromRangeDiatonicVariant(lowHz, highHz, a4Hz, noteDurSec, phraseSeedRef.current);

    lyricSeedRef.current = (lyricSeedRef.current + 1) >>> 0;
    const nextWords = makeWordLyricVariant(nextPhrase.notes.length, lyricStrategy, lyricSeedRef.current);

    setPhrase(nextPhrase);
    setWords(nextWords);
  }, [lowHz, highHz, lyricStrategy, a4Hz, noteDurSec]);

  /** Current lyric seed for metadata */
  const getLyricSeed = useCallback(() => lyricSeedRef.current, []);

  return { phrase, words, reset, advance, getLyricSeed };
}
