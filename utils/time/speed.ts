// utils/gameplay/speed.ts
export function effectiveBpm(baselineBpm: number, percent: number): number {
  const base = Math.max(1, Math.round(Number(baselineBpm) || 0));
  const pct = Math.max(75, Math.min(150, Math.round(Number(percent) || 100)));
  const bpm = Math.round((base * pct) / 100);
  return Math.max(1, bpm);
}
