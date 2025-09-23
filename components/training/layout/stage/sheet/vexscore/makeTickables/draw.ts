// components/training/layout/sheet/vexscore/makeTickables/draw.ts
import { StaveNote, GhostNote, Dot } from "vexflow";
import { tokToDuration, type Tok } from "../builders";
import type { TripletDurBase } from "./tuplets";

export function makeGhost(tok: Tok) {
  return new (GhostNote as any)(tokToDuration(tok)) as any;
}

export function makeManualRest(
  durationBase: "w" | "h" | "q" | "8" | "16" | "32" | "wr",
  dots: 0 | 1 | 2,
  clef: "treble" | "bass",
  opts?: { center?: boolean }
) {
  const key = clef === "treble" ? "b/4" : "d/3";
  const duration = durationBase === "wr" ? "wr" : (durationBase + "r");
  const rn = new StaveNote({
    keys: [key],
    duration: duration as any,
    clef,
    autoStem: true,
  }) as any;

  if (durationBase !== "wr" && dots) Dot.buildAndAttach([rn], { all: true });

  if (durationBase === "wr" || opts?.center) {
    rn.setCenterAlignment?.(true);
    rn.setCenterAligned?.(true);
    (rn as any).center_alignment = true;
  } else {
    rn.setCenterAlignment?.(false);
    rn.setCenterAligned?.(false);
    (rn as any).center_alignment = false;
  }

  rn.setIgnoreTicks?.(true);
  (rn as any).ignore_ticks = true;

  return rn as StaveNote;
}

/** Transparent **rest** tickable used inside triplet groups so beams/tuplets see 3 members. */
export function makeInvisibleTripletRest(base: TripletDurBase, clef: "treble" | "bass") {
  const key = clef === "treble" ? "b/4" : "d/3";
  const rn = new StaveNote({
    keys: [key],
    duration: (base + "r") as any, // real REST duration for beaming/tuplet math
    clef,
    autoStem: true,
  }) as any;
  if (typeof rn.setStyle === "function") {
    rn.setStyle({ fillStyle: "rgba(0,0,0,0)", strokeStyle: "rgba(0,0,0,0)" });
  }
  rn.isRest = () => true;
  (rn as any).getCategory = () => "rests";
  return rn as StaveNote;
}
