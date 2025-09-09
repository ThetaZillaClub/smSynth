// utils/lyrics/wordBank.ts

export const WORD_BANK: Record<string, string[]> = {
  IY: ["see","be","we","free","me"],
  EY: ["day","way","say","play","stay"],
  IH: ["this","wish","live","sing","give"],
  EH: ["breath","step","let","friend","best"],
  AE: ["back","hand","dance","glad","map"],
  AH: ["love","one","sun","come","up"],
  AA: ["star","heart","dark","far","start"],
  AO: ["fall","call","dawn","all","warm"],
  OW: ["go","so","road","home","slow"],
  UW: ["you","true","blue","moon","do"],
  AY: ["time","light","find","night","sky"],
  AW: ["now","out","down","loud","round"],
  OY: ["joy","voice","choice","boy","join"],
  ER: ["turn","word","learn","earth","first"],
};

const GROUPS = Object.keys(WORD_BANK);

// tiny deterministic PRNG (xorshift32)
function makeRng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 0xffffffff;
  };
}

/**
 * Deterministic lyric generator.
 * Pass a `seed` for reproducibility; if omitted, falls back to Math.random().
 */
export function makeWordLyric(
  n: number,
  strategy: "mixed" | "stableVowel" = "mixed",
  seed?: number
) {
  const rand = typeof seed === "number" ? makeRng(seed) : Math.random;
  const out: string[] = [];

  if (strategy === "stableVowel") {
    const g = GROUPS[Math.floor(rand() * GROUPS.length)];
    const arr = WORD_BANK[g];
    for (let i = 0; i < n; i++) out.push(arr[i % arr.length]);
    return out;
  }

  // mixed: rotate vowel groups for coverage, choose words deterministically
  for (let i = 0; i < n; i++) {
    const g = GROUPS[i % GROUPS.length];
    const arr = WORD_BANK[g];
    out.push(arr[Math.floor(rand() * arr.length)]);
  }
  return out;
}

/** Map a word back to its vowel/phoneme label (e.g., "see" -> "IY"). */
export function getPhonemeForWord(word: string): string | null {
  for (const [label, words] of Object.entries(WORD_BANK)) {
    if (words.includes(word)) return label;
  }
  return null;
}
