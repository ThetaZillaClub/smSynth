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

/** Original (kept) */
export function makeWordLyric(n: number, strategy: "mixed" | "stableVowel" = "mixed", seed?: number) {
  const rand = typeof seed === "number" ? makeRng(seed) : Math.random;
  const out: string[] = [];

  if (strategy === "stableVowel") {
    const g = GROUPS[Math.floor(rand() * GROUPS.length)];
    const arr = WORD_BANK[g];
    for (let i = 0; i < n; i++) out.push(arr[i % arr.length]);
    return out;
  }

  // fixed GROUPS rotation → can look the same run-to-run
  for (let i = 0; i < n; i++) {
    const g = GROUPS[i % GROUPS.length];
    const arr = WORD_BANK[g];
    out.push(arr[Math.floor(rand() * arr.length)]);
  }
  return out;
}

/** NEW: seeded variant → rotates GROUPS and occasionally reverses them */
export function makeWordLyricVariant(
  n: number,
  strategy: "mixed" | "stableVowel" = "mixed",
  seed?: number
) {
  const rand = typeof seed === "number" ? makeRng(seed) : Math.random;
  const out: string[] = [];

  if (strategy === "stableVowel") {
    const g = GROUPS[Math.floor(rand() * GROUPS.length)];
    const arr = WORD_BANK[g];
    for (let i = 0; i < n; i++) out.push(arr[(i + Math.floor(rand() * arr.length)) % arr.length]);
    return out;
  }

  // mixed: rotate + maybe reverse GROUPS, then draw words with seeded randomness
  const rot = Math.floor(rand() * GROUPS.length);
  const reversed = rand() < 0.5;
  const order = [...GROUPS.slice(rot), ...GROUPS.slice(0, rot)];
  if (reversed) order.reverse();

  for (let i = 0; i < n; i++) {
    const g = order[i % order.length];
    const arr = WORD_BANK[g];
    out.push(arr[Math.floor(rand() * arr.length)]);
  }
  return out;
}

/** (Optional) helper to avoid repeating words within a session */
export function makeWordLyricNoRepeat(
  n: number,
  used: Set<string>,
  strategy: "mixed" | "stableVowel" = "mixed",
  seed?: number
) {
  const base = makeWordLyricVariant(n * 2, strategy, seed); // oversample
  const out: string[] = [];
  for (const w of base) {
    if (!used.has(w)) {
      used.add(w);
      out.push(w);
      if (out.length === n) break;
    }
  }
  // if we ran out, just fill from base (rare with small n)
  while (out.length < n) out.push(base[out.length] ?? "la");
  return out;
}

export function getPhonemeForWord(word: string): string | null {
  for (const [label, words] of Object.entries(WORD_BANK)) {
    if (words.includes(word)) return label;
  }
  return null;
}
