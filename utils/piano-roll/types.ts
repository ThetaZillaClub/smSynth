// utils/piano-roll/types.ts
export type Note = { midi: number; startSec: number; durSec: number };
export type Phrase = { durationSec: number; notes: Note[] };
