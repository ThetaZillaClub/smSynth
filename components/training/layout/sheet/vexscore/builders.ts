// components/training/layout/sheet/vexscore/builders.ts
import { midiToNoteName } from "@/utils/pitch/pitchMath";
import type { NoteValue } from "@/utils/time/tempo";
import { Beam } from "vexflow";

/* =========================
 *  Durations / tokens
 * ========================= */

export type DurBase = "w" | "h" | "q" | "8" | "16" | "32";
export type DurString = DurBase | `${DurBase}d` | `${DurBase}dd`;
export type Tok = { dur: DurBase; dots: 0 | 1 | 2 };

/** Choose clef based on phrase register (simple heuristic). */
export function pickClef(
  phrase: { notes?: Array<{ midi: number }> } | null | undefined
): "treble" | "bass" {
  const ns = phrase?.notes ?? [];
  if (!ns.length) return "treble";
  let below = 0;
  for (const n of ns) if (n.midi < 60) below++;
  return below > ns.length / 2 ? "bass" : "treble";
}

/* ------------------ Key signature helpers (NEW) ------------------ */

// Circle-of-fifths orders
const ORDER_SHARPS = ["F","C","G","D","A","E","B"] as const;
const ORDER_FLATS  = ["B","E","A","D","G","C","F"] as const;

const MAJOR_KEY_FIFTHS: Record<string, number> = {
  "C": 0,  "G": 1,  "D": 2,  "A": 3,  "E": 4,  "B": 5,  "F#": 6, "C#": 7,
  "F": -1, "Bb":-2, "Eb":-3, "Ab":-4, "Db":-5, "Gb":-6, "Cb":-7,
};

/** Build a letter→accidental map for a given (major) key, e.g. {F:'#'} for G major. */
export function keyAccidentals(key: string | null | undefined):
  Record<"A"|"B"|"C"|"D"|"E"|"F"|"G", ""|"#"|"b"> {
  const base: Record<"A"|"B"|"C"|"D"|"E"|"F"|"G",""|"#"|"b"> =
    { A:"", B:"", C:"", D:"", E:"", F:"", G:"" };
  if (!key) return base;
  const fifths = MAJOR_KEY_FIFTHS[key] ?? 0;
  if (fifths > 0) {
    for (let i = 0; i < fifths; i++) base[ORDER_SHARPS[i]!] = "#";
  } else if (fifths < 0) {
    for (let i = 0; i < -fifths; i++) base[ORDER_FLATS[i]!] = "b";
  }
  return base;
}

/** Local alias for common scale names; adjust to your project if needed. */
type ScaleName =
  | "major" | "natural_minor" | "harmonic_minor" | "melodic_minor"
  | "dorian" | "phrygian" | "lydian" | "mixolydian" | "locrian"
  | "major_pentatonic" | "minor_pentatonic" | "chromatic";

/** Compute a sensible major-key name from tonicPc + scale (modes/minor → relative major). */
export function keyNameFromTonicPc(
  tonicPc: number,
  scaleName: ScaleName = "major",
  // FLIPPED: prefer flats for ambiguous major keys by default
  preferSharps: boolean = false
): string {
  // mode → semitone offset (major degrees): 0,2,4,5,7,9,11
  const OFF: Record<ScaleName, number> = {
    major: 0,
    natural_minor: 9,
    harmonic_minor: 9,
    melodic_minor: 9,
    dorian: 2,
    phrygian: 4,
    lydian: 5,
    mixolydian: 7,
    locrian: 11,
    major_pentatonic: 0,
    minor_pentatonic: 9,
    chromatic: 0,
  };
  const parentMajPc = ((tonicPc - (OFF[scaleName] ?? 0)) % 12 + 12) % 12;

  const SHARP_NAMES: Record<number,string> = { 0:"C", 1:"C#", 2:"D", 3:"D#", 4:"E", 5:"F", 6:"F#", 7:"G", 8:"G#", 9:"A", 10:"A#", 11:"B" };
  const FLAT_NAMES:  Record<number,string> = { 0:"C", 1:"Db", 2:"D", 3:"Eb", 4:"E", 5:"F", 6:"Gb", 7:"G", 8:"Ab", 9:"A", 10:"Bb", 11:"Cb" };

  const sharpName = SHARP_NAMES[parentMajPc];
  const flatName  = FLAT_NAMES[parentMajPc];
  const pick = (n: string) => (n in MAJOR_KEY_FIFTHS) ? n : null;

  const candSharp = pick(sharpName);
  const candFlat  = pick(flatName);

  if (candSharp && candFlat) {
    if (preferSharps) return candSharp;
    // Prefer flats for ambiguous keys, except keep B over Cb (more conventional)
    if (parentMajPc === 11) return candSharp; // B, not Cb
    return candFlat;
  }
  return candSharp ?? candFlat ?? "C";
}

/**
 * Convert MIDI → VexFlow key string + (only-if-needed) accidental **relative to key signature**.
 * If `keyMap` is omitted, we fall back to the old behavior (always attach '#'/'b' when present).
 * NEW: when `keyMap` is provided, choose the enharmonic (sharp/flat) that best matches the signature.
 */
export function midiToVexKey(
  midi: number,
  useSharps: boolean,
  keyMap?: Record<"A"|"B"|"C"|"D"|"E"|"F"|"G", ""|"#"|"b">
): { key: string; accidental: "#"|"b"|"n"|null } {
  // Helper to get a spelling
  const pickName = (preferSharps: boolean) =>
    midiToNoteName(midi, { useSharps: preferSharps, octaveAnchor: "C" });

  // Default choice respects caller preference
  let chosen = pickName(useSharps);

  if (keyMap) {
    const sharpName = pickName(true);
    const flatName  = pickName(false);

    const score = (nm: { name: string }) => {
      const L = nm.name[0]!.toUpperCase() as "A"|"B"|"C"|"D"|"E"|"F"|"G";
      const acc = (nm.name.length > 1 ? nm.name.slice(1) : "") as ""|"#"|"b";
      const exp = keyMap[L] || "";
      if (acc === exp) return 3;               // exact match to signature for that letter
      if (exp === "" && acc === "") return 2;  // natural where natural expected
      // soft bias toward the family's accidentals if neither is exact
      const flats  = Object.values(keyMap).filter(a => a === "b").length;
      const sharps = Object.values(keyMap).filter(a => a === "#").length;
      const preferSharpsFamily = sharps > flats;
      if (preferSharpsFamily && acc === "#") return 1;
      if (!preferSharpsFamily && acc === "b") return 1;
      return 0;
    };

    // Choose the better-scoring enharmonic (e.g., Eb over D# in flat keys)
    chosen = score(flatName) > score(sharpName) ? flatName : sharpName;
  }

  const letter = chosen.name[0]!.toUpperCase() as "A"|"B"|"C"|"D"|"E"|"F"|"G";
  const accidentalActual = (chosen.name.length > 1 ? chosen.name.slice(1) : "") as ""|"#"|"b";
  const key = accidentalActual
    ? `${letter.toLowerCase()}${accidentalActual}/${chosen.octave}`
    : `${letter.toLowerCase()}/${chosen.octave}`;

  // If we don't have a key signature, emit whatever accidental is present.
  if (!keyMap) {
    return { key, accidental: accidentalActual || null };
  }

  // Otherwise, emit accidentals **relative to the key signature**.
  const expected = keyMap[letter] || "";
  if (accidentalActual === expected) return { key, accidental: null };
  if (accidentalActual === "" && (expected === "#" || expected === "b")) return { key, accidental: "n" };
  if ((accidentalActual === "#" && expected === "") || (accidentalActual === "b" && expected === "")) {
    return { key, accidental: accidentalActual };
  }
  return { key, accidental: (accidentalActual || "n") as "#"|"b"|"n" };
}

/** Convert token to VexFlow duration string. */
export function tokToDuration(t: Tok): DurString {
  const dot = t.dots === 2 ? "dd" : t.dots === 1 ? "d" : "";
  return `${t.dur}${dot}` as DurString;
}

/** NoteValue → base token (+ optional triplet hint). */
export function mapNoteValue(v: NoteValue): { tok: Tok; triplet?: boolean } {
  switch (v) {
    case "whole": return { tok: { dur: "w", dots: 0 } };
    case "dotted-half": return { tok: { dur: "h", dots: 1 } };
    case "half": return { tok: { dur: "h", dots: 0 } };
    case "dotted-quarter": return { tok: { dur: "q", dots: 1 } };
    case "triplet-quarter": return { tok: { dur: "q", dots: 0 }, triplet: true };
    case "quarter": return { tok: { dur: "q", dots: 0 } };
    case "dotted-eighth": return { tok: { dur: "8", dots: 1 } };
    case "triplet-eighth": return { tok: { dur: "8", dots: 0 }, triplet: true };
    case "eighth": return { tok: { dur: "8", dots: 0 } };
    case "dotted-sixteenth": return { tok: { dur: "16", dots: 1 } };
    case "triplet-sixteenth": return { tok: { dur: "16", dots: 0 }, triplet: true };
    case "sixteenth": return { tok: { dur: "16", dots: 0 } };
    case "thirtysecond": return { tok: { dur: "32", dots: 0 } };
    default: return { tok: { dur: "8", dots: 0 } };
  }
}

/** Convert token to seconds (secPerWholeNote = 1 / wnPerSec). */
export function tokToSeconds(tok: Tok, secPerWholeNote: number, isTriplet: boolean = false): number {
  const baseWN: Record<DurBase, number> = { w: 1, h: 0.5, q: 0.25, "8": 0.125, "16": 0.0625, "32": 0.03125 };
  const mul = tok.dots === 2 ? 1.75 : tok.dots === 1 ? 1.5 : 1;
  const wn = baseWN[tok.dur] * mul;
  const tupletFactor = isTriplet ? 2 / 3 : 1;
  return wn * tupletFactor * secPerWholeNote;
}

/**
 * Greedy tokenization whole→(16th|32nd) with dot support.
 */
export function secondsToTokens(
  sec: number,
  wnPerSec: number,
  maxBase: Extract<DurBase, "16" | "32"> = "16"
): Tok[] {
  const baseWN: Record<DurBase, number> = { w: 1, h: 0.5, q: 0.25, "8": 0.125, "16": 0.0625, "32": 0.03125 };
  const mk = (dur: DurBase, dots: Tok["dots"]) => ({
    dur,
    dots,
    wn: baseWN[dur] * (dots === 2 ? 1.75 : dots === 1 ? 1.5 : 1),
  });
  const targets: Array<{ dur: DurBase; dots: Tok["dots"]; wn: number }> = [
    mk("w", 2), mk("w", 1), mk("w", 0),
    mk("h", 2), mk("h", 1), mk("h", 0),
    mk("q", 2), mk("q", 1), mk("q", 0),
    mk("8", 2), mk("8", 1), mk("8", 0),
    mk("16", 2), mk("16", 1), mk("16", 0),
    ...(maxBase === "32" ? [mk("32", 2), mk("32", 1), mk("32", 0)] : []),
  ];
  const totalWN = Math.max(0, sec * wnPerSec);
  const out: Tok[] = [];
  let remain = totalWN;

  while (remain > 1e-6) {
    let pick: Tok | null = null;
    for (const t of targets) {
      if (t.wn <= remain + 1e-6) { pick = { dur: t.dur, dots: t.dots }; break; }
    }
    if (!pick) pick = { dur: maxBase, dots: 0 };
    out.push(pick);
    const dwn =
      (pick.dur === "w" ? baseWN.w :
       (pick.dur === "h" ? baseWN.h :
       (pick.dur === "q" ? baseWN.q :
       (pick.dur === "8" ? baseWN["8"] :
       (pick.dur === "16" ? baseWN["16"] : baseWN["32"])))) *
      (pick.dots === 2 ? 1.75 : pick.dots === 1 ? 1.5 : 1));
    remain -= dwn;
  }
  return out;
}

/* =========================
 *  Beaming
 * ========================= */

export type BuildBeamsOpts = {
  groupKeys?: Array<string | number | null | undefined>;
  getGroupKey?: (note: any, index: number) => string | number | null | undefined;
  allowMixed?: boolean;
  sameStemOnly?: boolean;
};

function normDur(d: unknown): string | null {
  if (typeof d !== "string") return null;
  const base = d.endsWith("r") ? d.slice(0, -1) : d;
  if (
    base === "8" || base === "8d" ||
    base === "16" || base === "16d" ||
    base === "32" || base === "32d"
  ) return base;
  return null;
}

function isRest(note: any): boolean {
  if (typeof note?.isRest === "function") return !!note.isRest();
  const dur = note?.getDuration?.();
  if (typeof dur === "string" && dur.endsWith("r")) return true;
  const cat = typeof note?.getCategory === "function" ? note.getCategory() : "";
  if (typeof cat === "string" && cat.toLowerCase().includes("ghost")) return true;
  return false;
}

function groupKeyFor(note: any, i: number, opts?: BuildBeamsOpts) {
  if (opts?.groupKeys) return opts.groupKeys[i];
  if (opts?.getGroupKey) return opts.getGroupKey(note, i);
  return note?.measureIndex ?? note?.__barIndex ?? note?.barIndex ?? null;
}

function defaultStemDir(note: any): 1 | -1 {
  try {
    if (typeof note?.getStemDirection === "function") {
      const sd = note.getStemDirection();
      if (sd === 1 || sd === -1) return sd as 1 | -1;
    }
    const props = typeof note?.getKeyProps === "function" ? note.getKeyProps() : null;
    if (Array.isArray(props) && props.length) {
      const sum = props.reduce((s: number, p: any) => s + (typeof p?.line === "number" ? p.line : 0), 0);
      const avg = sum / props.length;
      return avg > 2 ? 1 : -1;
    }
  } catch { /* ignore */ }
  return 1;
}

export function buildBeams(notes: any[], opts?: BuildBeamsOpts) {
  const allowMixed   = opts?.allowMixed !== false;
  const sameStemOnly = opts?.sameStemOnly !== false;

  const groups = new Map<string | number | null, any[]>();
  notes.forEach((n, i) => {
    const k = groupKeyFor(n, i, opts) ?? null;
    const arr = groups.get(k) ?? [];
    arr.push(n);
    if (!groups.has(k)) groups.set(k, arr);
  });

  const out: any[] = [];

  groups.forEach((arr) => {
    let run: any[] = [];
    let runDur: string | null = null;
    let runStem: 1 | -1 | null = null;

    const flush = () => {
      if (run.length >= 2) {
        const auto = Beam.generateBeams(run, {
          maintainStemDirections: true,
          beamRests: false,
        });
        if (auto.length) out.push(...auto);
        else out.push(new Beam(run));
      }
      run = [];
      runDur = null;
      runStem = null;
    };

    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      const nd = normDur(n?.getDuration?.());
      if (!nd || isRest(n)) { flush(); continue; }

      const sd = defaultStemDir(n);

      if (run.length === 0) {
        run.push(n);
        runDur = nd;
        runStem = sd;
        continue;
      }

      const stemOK = !sameStemOnly || sd === runStem;

      if (!stemOK) {
        flush();
        run.push(n);
        runDur = nd;
        runStem = sd;
        continue;
      }

      if (allowMixed) {
        run.push(n);
      } else {
        if (nd === runDur) run.push(n);
        else { flush(); run.push(n); runDur = nd; runStem = sd; }
      }
    }

    flush();
  });

  return out;
}
