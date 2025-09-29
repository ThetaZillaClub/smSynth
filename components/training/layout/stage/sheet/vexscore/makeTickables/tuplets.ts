// components/training/layout/stage/sheet/vexscore/makeTickables/tuplets.ts
import { Tuplet } from "vexflow";
import type { StemmableNote } from "vexflow";

/** Triplet-able base durations. (No whole or 32nd here.) */
export type TripletDurBase = "h" | "q" | "8" | "16";

/** Map triplet quarter-units → base head duration inside the tuplet group. */
export function tripletBaseForQ(q: number): TripletDurBase | null {
  if (q === 4 / 3) return "h";   // half-note triplet member
  if (q === 2 / 3) return "q";   // quarter-note triplet member
  if (q === 1 / 3) return "8";   // eighth-note triplet member
  if (q === 1 / 6) return "16";  // sixteenth-note triplet member
  return null;
}

export type TripletSlot = {
  base: TripletDurBase; // h/q/8/16
  /** the actual tickable in the voice for this slot (note or transparent rest) */
  node: StemmableNote;
  /** absolute time (sec) and bar index of this slot — for bookkeeping only */
  start: number;
  barIdx: number;
};

export function buildTupletFromSlots(slots: TripletSlot[], tuplets: Tuplet[]) {
  if (slots.length !== 3) return;
  const b = slots[0].base;
  if (!(slots[1].base === b && slots[2].base === b)) return;
  const nodes = slots.map((s) => s.node); // StemmableNote[]
  tuplets.push(new Tuplet(nodes, { bracketed: true, ratioed: false, numNotes: 3 }));
}
