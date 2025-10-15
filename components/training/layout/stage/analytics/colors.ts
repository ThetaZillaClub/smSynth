// components/training/layout/stage/analytics/colors.ts
// Brand-y palette for analytics. Hand-coded, inspired by the logo “petals”.
export const ANA_COLORS = {
  gridMajor: "rgba(0,0,0,0.12)",
  gridMinor: "rgba(0,0,0,0.06)",

  // series palette (ROYGBIV-ish, readable on light bg)
  series: [
    "#ef4444", // red
    "#ff8c00", // darkorange
    "#f97316", // orange
    "#22c55e", // green
    "#3b82f6", // blue
    "#a855f7", // purple
    "#6366f1", // indigo
  ],
};

export function withAlpha(hex: string, a: number): string {
  // hex like #rrggbb
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(0,0,0,${a})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

export function colorForIndex(i: number): string {
  const arr = ANA_COLORS.series;
  return arr[((i % arr.length) + arr.length) % arr.length];
}

export function colorForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h * 31) + key.charCodeAt(i)) | 0;
  return colorForIndex(Math.abs(h));
}
