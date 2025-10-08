// components/vision/stage/hooks/latency.ts

export const median = (xs: number[]) => {
  const a = xs.slice().sort((x, y) => x - y);
  const n = a.length;
  if (!n) return NaN;
  const m = (n - 1) / 2;
  return n % 2 ? a[m | 0] : (a[m | 0] + a[(m | 0) + 1]) / 2;
};

export const iqrFilter = (xs: number[]) => {
  if (xs.length < 4) return xs.slice();
  const s = xs.slice().sort((a, b) => a - b);
  const q1 = s[Math.floor((s.length - 1) * 0.25)];
  const q3 = s[Math.floor((s.length - 1) * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return s.filter((v) => v >= lo && v <= hi);
};
