// utils/phrase/rational.ts
import type { Rat } from "./phraseTypes";

/** Greatest common divisor. */
export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** Least common multiple. */
export const lcm = (a: number, b: number): number => Math.abs(a / (gcd(a, b) || 1) * b);

/** Reduce a rational to lowest terms; denominator normalized positive. */
export const reduce = ({ n, d }: Rat): Rat => {
  const g = gcd(n, d) || 1;
  const sign = d < 0 ? -1 : 1;
  return { n: sign * (n / g), d: sign * (d / g) };
};

/** a + b (exact). */
export const addRat = (a: Rat, b: Rat): Rat => reduce({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });

/** a − b (exact). */
export const subRat = (a: Rat, b: Rat): Rat => reduce({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
