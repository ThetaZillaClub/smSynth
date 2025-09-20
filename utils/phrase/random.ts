// utils/phrase/random.ts
/**
 * Create a deterministic xorshift32 RNG.
 * @param seed Unsigned 32-bit integer seed
 * @returns Pure PRNG function in [0,1)
 */
export function makeRng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 0xffffffff;
  };
}

/** Pick a random element from an array using a supplied RNG. */
export function choose<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}
