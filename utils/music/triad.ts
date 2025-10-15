export function triadOffsetsForScale(name?: string | null) {
  const minorish = new Set([
    "minor","aeolian","natural_minor","dorian","phrygian",
    "harmonic_minor","melodic_minor","minor_pentatonic",
  ]);
  const third = name && minorish.has(name) ? 3 : 4;
  const fifth = name === "locrian" ? 6 : 7;
  return { third, fifth };
}
