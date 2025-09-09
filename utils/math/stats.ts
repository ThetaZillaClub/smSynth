// utils/math/stats.ts
export const mean = (a: number[]) =>
  (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

export const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

export const dbfs = (rms: number) => 20 * Math.log10(rms + 1e-12);
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
