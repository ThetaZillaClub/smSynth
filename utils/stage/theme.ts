// utils/stage/theme.ts
// Shared stage colors (aligned to site palette).

export const PR_COLORS = {
  bg: "#f2f2f2",
  gridMinor: "rgba(15,15,15,0.08)",
  gridMajor: "rgba(15,15,15,0.18)",
  label: "rgba(15,15,15,1)",

  noteFill: "#22c55e",                // emerald-500
  noteStroke: "rgba(21,128,61,0.65)", // emerald-700 @ 65%

  timeline: "rgba(15,15,15,0.18)",
  trace: "#0f0f0f",                   // kept if you re-enable the live trace
  playhead: "rgba(15,15,15,0.50)",    // (not used now)
  dotFill: "#0f0f0f",
  dotStroke: "rgba(255,255,255,0.85)"
} as const;
