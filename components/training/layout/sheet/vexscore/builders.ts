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

/** Map MIDI → VexFlow key string and (optional) accidental. */
export function midiToVexKey(midi: number, useSharps: boolean) {
  const { name, octave } = midiToNoteName(midi, { useSharps, octaveAnchor: "C" });
  const letter = name[0].toLowerCase();
  const acc = name.length > 1 ? name.slice(1) : "";
  const key = acc ? `${letter}${acc}/${octave}` : `${letter}/${octave}`;
  return { key, accidental: acc || null };
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
 * @param sec seconds
 * @param wnPerSec whole notes per second
 * @param maxBase deepest base note to consider (default "16")
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
 *  Beaming — hybrid: custom runs + VF auto-beamer
 * ========================= */

export type BuildBeamsOpts = {
  groupKeys?: Array<string | number | null | undefined>;
  getGroupKey?: (note: any, index: number) => string | number | null | undefined;
  allowMixed?: boolean;       // default: true (kept for API compatibility)
  /** Only beam runs that keep the same default stem direction (default: true). */
  sameStemOnly?: boolean;
};

/** Normalize a VexFlow duration string to an eligible beaming token. */
function normDur(d: unknown): string | null {
  if (typeof d !== "string") return null;
  const base = d.endsWith("r") ? d.slice(0, -1) : d; // strip trailing 'r' on rests
  if (
    base === "8" || base === "8d" ||
    base === "16" || base === "16d" ||
    base === "32" || base === "32d"
  ) return base;
  return null;
}

/** Treat StaveNote rests *and* GhostNotes as rests. */
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

/**
 * Infer a reasonable *default* stem direction.
 * Honor explicit stem direction if it exists (so we can force up-stems on melody).
 */
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
  return 1; // benign fallback
}

/**
 * Build beams (tutorial style, no cross-stem beaming):
 * 1) Split into groups (e.g., by bar).
 * 2) Within each group, make contiguous runs of beam-eligible notes (8th/16th/32nd, dotted ok),
 *    stopping on rests or stem direction flips.
 * 3) For each run, call VF auto-beamer with:
 *      - maintainStemDirections: true (preserve our stems; splits where needed)
 *      - beamRests: false (rests break groups)
 *    This gives quarter-beat grouping + secondary breaks automatically.
 */
export function buildBeams(notes: any[], opts?: BuildBeamsOpts) {
  const allowMixed   = opts?.allowMixed !== false;     // default: true
  const sameStemOnly = opts?.sameStemOnly !== false;   // default: true

  // 1) partition by group key
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
    let runDur: string | null = null; // used if allowMixed === false
    let runStem: 1 | -1 | null = null;

    const flush = () => {
      if (run.length >= 2) {
        // 3) let VexFlow split within the run as needed (per quarter, secondary breaks)
        const auto = Beam.generateBeams(run, {
          maintainStemDirections: true,
          beamRests: false,
        });
        if (auto.length) out.push(...auto);
        else out.push(new Beam(run)); // fallback (should rarely happen)
      }
      run = [];
      runDur = null;
      runStem = null;
    };

    // 2) scan the group, forming runs
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
