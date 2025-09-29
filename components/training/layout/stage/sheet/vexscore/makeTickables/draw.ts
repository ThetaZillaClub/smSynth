// components/training/layout/stage/sheet/vexscore/makeTickables/draw.ts
import { StaveNote, GhostNote, Dot } from "vexflow";
import { tokToDuration, type Tok } from "../builders";
import type { TripletDurBase } from "./tuplets";

/** Small augmentation for knobs VexFlow doesn't always type. */
type RestishStaveNote = StaveNote & {
  setCenterAlignment?: (v: boolean) => void;
  setCenterAligned?: (v: boolean) => void;
  center_alignment?: boolean;

  setIgnoreTicks?: (v: boolean) => void;
  ignore_ticks?: boolean;

  setStyle?: (s: { fillStyle?: string; strokeStyle?: string }) => void;
  isRest?: () => boolean;
  getCategory?: () => string;
};

export function makeGhost(tok: Tok): GhostNote {
  return new GhostNote({ duration: tokToDuration(tok) });
}

export function makeManualRest(
  durationBase: "w" | "h" | "q" | "8" | "16" | "32" | "wr",
  dots: 0 | 1 | 2,
  clef: "treble" | "bass",
  opts?: { center?: boolean }
): StaveNote {
  const key = clef === "treble" ? "b/4" : "d/3";
  const duration: string = durationBase === "wr" ? "wr" : `${durationBase}r`;

  const rn = new StaveNote({
    keys: [key],
    duration,
    clef,
    autoStem: true,
  }) as RestishStaveNote;

  if (durationBase !== "wr" && dots) {
    Dot.buildAndAttach([rn], { all: true });
  }

  if (durationBase === "wr" || opts?.center) {
    rn.setCenterAlignment?.(true);
    rn.setCenterAligned?.(true);
    rn.center_alignment = true;
  } else {
    rn.setCenterAlignment?.(false);
    rn.setCenterAligned?.(false);
    rn.center_alignment = false;
  }

  rn.setIgnoreTicks?.(true);
  rn.ignore_ticks = true;

  return rn;
}

/** Transparent **rest** tickable used inside triplet groups so beams/tuplets see 3 members. */
export function makeInvisibleTripletRest(
  base: TripletDurBase,
  clef: "treble" | "bass"
): StaveNote {
  const key = clef === "treble" ? "b/4" : "d/3";
  const rn = new StaveNote({
    keys: [key],
    duration: `${base}r`,
    clef,
    autoStem: true,
  }) as RestishStaveNote;

  rn.setStyle?.({ fillStyle: "rgba(0,0,0,0)", strokeStyle: "rgba(0,0,0,0)" });
  rn.isRest = () => true;
  rn.getCategory = () => "rests";

  return rn;
}
