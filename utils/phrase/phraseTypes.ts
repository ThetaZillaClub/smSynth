// utils/phrase/phraseTypes.ts
import type { NoteValue } from "@/utils/time/tempo";

/** Rhythm event — can be a note or rest with a musical value. */
export type RhythmEvent = { type: "note" | "rest"; value: NoteValue };

/** A reduced rational number (n/d), denominator normalized positive. */
export type Rat = { n: number; d: number };
