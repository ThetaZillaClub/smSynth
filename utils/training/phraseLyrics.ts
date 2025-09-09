// utils/training/phraseLyrics.ts
import type { Phrase } from "@/components/piano-roll/types";
import { makeWordLyricVariant } from "@/utils/lyrics/wordBank";
import { buildPhraseFromRangeDiatonicVariant } from "@/utils/phrase/diatonic";

export function makeNextPhraseLyrics({
  lowHz,
  highHz,
  lyricStrategy,
  phraseSeed,
  lyricSeed,
  noteDurSec,
  a4Hz = 440,
}: {
  lowHz: number;
  highHz: number;
  lyricStrategy: "mixed" | "stableVowel";
  phraseSeed: number;
  lyricSeed: number;
  noteDurSec: number;
  a4Hz?: number;
}): { phrase: Phrase; words: string[]; nextPhraseSeed: number; nextLyricSeed: number } {
  const phrase = buildPhraseFromRangeDiatonicVariant(lowHz, highHz, a4Hz, noteDurSec, phraseSeed);
  const words = makeWordLyricVariant(phrase.notes.length, lyricStrategy, lyricSeed);
  return {
    phrase,
    words,
    nextPhraseSeed: (phraseSeed + 1) >>> 0,
    nextLyricSeed: (lyricSeed + 1) >>> 0,
  };
}
