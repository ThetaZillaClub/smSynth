// utils/gameplay/tonic.ts
import { hzToMidi } from "@/utils/pitch/pitchMath";

/** Compute allowed tonic pitch classes from a vocal range. */
export function allowedTonicPcsFromRange(
  lowHz: number | null,
  highHz: number | null
): Set<number> {
  if (lowHz == null || highHz == null) return new Set();
  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
  const maxTonic = hiM - 12;
  if (maxTonic < loM) return new Set();

  const set = new Set<number>();
  for (let m = loM; m <= maxTonic; m++) set.add(((m % 12) + 12) % 12);
  return set;
}

/** Overloads to support both legacy positional and new object call styles. */
export function resolveTonicPc(
  keyChoice: "random" | number,
  allowed: Set<number>,
  fallbackPc: number
): number;
export function resolveTonicPc(
  keyChoice: "random" | number,
  allowed: Set<number>,
  fallbackPc: number,
  randomPcRef?: { current: number | null }
): number;
export function resolveTonicPc(params: {
  keyChoice: "random" | number;
  allowed: Set<number>;
  fallbackPc: number;
  randomPcRef?: { current: number | null };
}): number;
/** Implementation */
export function resolveTonicPc(
  a:
    | ("random" | number)
    | {
        keyChoice: "random" | number;
        allowed: Set<number>;
        fallbackPc: number;
        randomPcRef?: { current: number | null };
      },
  b?: Set<number>,
  c?: number,
  d?: { current: number | null }
): number {
  let keyChoice: "random" | number;
  let allowed: Set<number>;
  let fallbackPc: number;
  let randomPcRef = d;

  if (typeof a === "object" && a !== null && "allowed" in a) {
    keyChoice = a.keyChoice;
    allowed = a.allowed;
    fallbackPc = a.fallbackPc;
    randomPcRef = a.randomPcRef;
  } else {
    keyChoice = a as "random" | number;
    allowed = b as Set<number>;
    fallbackPc = c as number;
  }

  const norm = (pc: number) => ((pc % 12) + 12) % 12;

  if (typeof keyChoice === "number") return norm(keyChoice);
  if (!allowed.size) return norm(fallbackPc);

  const cached = randomPcRef?.current;
  if (cached != null && allowed.has(norm(cached))) {
    return norm(cached);
  }

  const pcs = Array.from(allowed);
  const pick = pcs[Math.floor(Math.random() * pcs.length)];
  if (randomPcRef) randomPcRef.current = pick;
  return norm(pick);
}

/** From range + tonicPc + preference, return a single tonic MIDI (low/high window) or null. */
export function tonicMidisFromPreference(
  lowHz: number | null,
  highHz: number | null,
  tonicPc: number,
  pref: "low" | "high"
): number[] | null {
  if (lowHz == null || highHz == null) return null;
  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
  const wantPc = ((tonicPc % 12) + 12) % 12;

  const windows: number[] = [];
  for (let m = loM; m <= hiM - 12; m++) {
    if ((((m % 12) + 12) % 12) === wantPc) windows.push(m);
  }
  if (!windows.length) return null;

  const idx = pref === "high" ? windows.length - 1 : 0;
  return [windows[idx]];
}
