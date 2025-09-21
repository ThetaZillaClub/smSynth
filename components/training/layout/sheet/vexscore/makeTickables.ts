// components/training/layout/sheet/vexscore/makeTickables.ts
import {
  StaveNote,
  Accidental,
  Dot,
  Tuplet,
  Annotation,
  AnnotationHorizontalJustify as AHJ,
  AnnotationVerticalJustify as AVJ,
} from "vexflow";
import type { Phrase } from "@/utils/piano-roll/scale";
import type { RhythmEvent } from "@/utils/phrase/generator";
import type { NoteValue } from "@/utils/time/tempo";
import {
  midiToVexKey,
  secondsToTokens,
  type Tok,
} from "./builders";
import { noteValueInQuarterUnits } from "@/utils/time/tempo";

/* =========================
 *  Integer timing grid (PPQ) to kill float drift
 * ========================= */
const PPQ = 960; // ticks per quarter (classic MIDI-ish)

/** Convert PPQ ticks → seconds using secPerQuarter. */
function ticksToSeconds(ticks: number, secPerQuarter: number): number {
  return (ticks / PPQ) * secPerQuarter;
}

/** Quarter units for a Tok (no tuplets involved here). */
function tokQuarterUnits(tok: Tok): number {
  const base: Record<Tok["dur"], number> = {
    w: 4,
    h: 2,
    q: 1,
    "8": 0.5,
    "16": 0.25,
    "32": 0.125,
  };
  const mul = tok.dots === 2 ? 1.75 : tok.dots === 1 ? 1.5 : 1;
  return base[tok.dur] * mul;
}

/** Convert Tok (no tuplets) to PPQ ticks. */
function tokToTicks(tok: Tok): number {
  return Math.round(tokQuarterUnits(tok) * PPQ);
}

/** Convert NoteValue (includes triplets/dots) to PPQ ticks. */
function noteValueToTicks(v: NoteValue): number {
  const q = noteValueInQuarterUnits(v);
  return Math.round(q * PPQ);
}

/** staff rest for a clef (visible) */
function makeRest(durationBase: "w" | "h" | "q" | "8" | "16" | "32", clef: "treble" | "bass") {
  const key = clef === "treble" ? "b/4" : "d/3";
  return new StaveNote({ keys: [key], duration: (durationBase + "r") as any, clef, autoStem: true });
}

/* Map quarter-units → base duration + dot count. (Triplets return base with 0 dots.) */
function quarterToBaseAndDots(q: number): { base: "w"|"h"|"q"|"8"|"16"|"32"; dots: 0|1|2 } {
  if (q === 4)   return { base: "w",  dots: 0 };
  if (q === 3)   return { base: "h",  dots: 1 };
  if (q === 2)   return { base: "h",  dots: 0 };
  if (q === 1.5) return { base: "q",  dots: 1 };
  if (q === 1)   return { base: "q",  dots: 0 };
  if (q === 0.75)return { base: "8",  dots: 1 };
  if (q === 2/3) return { base: "q",  dots: 0 };   // triplet quarter
  if (q === 0.5) return { base: "8",  dots: 0 };
  if (q === 3/8) return { base: "16", dots: 1 };
  if (q === 1/3) return { base: "8",  dots: 0 };   // triplet eighth
  if (q === 0.25)return { base: "16", dots: 0 };
  if (q === 1/6) return { base: "16", dots: 0 };   // triplet sixteenth
  return { base: "32", dots: 0 };
}

/**
 * Build MELODY tickables with optional key-signature awareness.
 */
export function buildMelodyTickables(params: {
  phrase: Phrase;
  clef: "treble" | "bass";
  useSharps: boolean;
  leadInSec: number;
  wnPerSec: number;
  secPerWholeNote: number;
  secPerBeat: number;
  secPerBar: number;           // used to pad to bar boundaries
  lyrics?: string[];
  rhythm?: RhythmEvent[];
  /** NEW: letter→accidental map for the current key signature. */
  keyAccidentals?: Record<"A"|"B"|"C"|"D"|"E"|"F"|"G", ""|"#"|"b"> | null;
}) {
  const {
    phrase,
    clef,
    useSharps,
    leadInSec,
    wnPerSec,
    secPerWholeNote,
    secPerBeat,   // for comments
    secPerBar,
    lyrics,
    rhythm,
    keyAccidentals: keyMap,
  } = params;

  const secPerQuarter = secPerWholeNote / 4;

  const ticksOut: any[] = [];
  const startsSec: number[] = [];
  const tuplets: Tuplet[] = [];
  let tTicks = 0; // integer PPQ time

  // Helper: pad current timeline up to the next whole bar using visible rests
  const padToNextBar = () => {
    const curSec = ticksToSeconds(tTicks, secPerQuarter);
    const nextBarEnd = Math.ceil((curSec + 1e-9) / Math.max(1e-9, secPerBar)) * secPerBar;
    let need = nextBarEnd - curSec;
    if (need <= 1e-6) return;
    for (const tok of secondsToTokens(need, wnPerSec, "32")) {
      const r = makeRest(tok.dur as any, clef);
      if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
      ticksOut.push(r);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += tokToTicks(tok);
    }
  };

  // --- lead-in as rests ---
  if (leadInSec > 1e-6) {
    for (const tok of secondsToTokens(leadInSec, wnPerSec, "32")) {
      const r = makeRest(tok.dur as any, clef);
      if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
      ticksOut.push(r);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += tokToTicks(tok);
    }
  }

  // ----- Exact rhythm-driven path -----
  if (Array.isArray(rhythm) && rhythm.length) {
    const melNotes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
    let ni = 0;
    let lyricIndex = 0;

    let tripletBuf: { base: Tok["dur"]; note: StaveNote }[] = [];
    const flush = () => {
      for (let i = 0; i + 2 < tripletBuf.length; i += 3) {
        const a = tripletBuf[i], b = tripletBuf[i + 1], c = tripletBuf[i + 2];
        if (a.base === b.base && b.base === c.base) {
          tuplets.push(new Tuplet([a.note, b.note, c.note] as any, {
            bracketed: true,
            ratioed: false,
          }));
        }
      }
      tripletBuf = [];
    };

    for (const ev of rhythm) {
      const durTicks = noteValueToTicks(ev.value);
      const q = noteValueInQuarterUnits(ev.value);
      const { base, dots } = quarterToBaseAndDots(q);

      if (ev.type === "rest") {
        const rn = makeRest(base as any, clef);
        if (dots) Dot.buildAndAttach([rn as any], { all: true });
        ticksOut.push(rn);
        startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
        tTicks += durTicks;
        flush();
        continue;
      }

      const src = melNotes[ni] ?? melNotes[melNotes.length - 1] ?? null;
      const midi = src?.midi ?? 60;
      const { key, accidental } = midiToVexKey(midi, useSharps, keyMap || undefined);

      const sn = new StaveNote({
        keys: [key],
        duration: base as any,
        clef,
        autoStem: false,
        stemDirection: 1,   // force stems/flags up
      });
      if (accidental) sn.addModifier(new Accidental(accidental), 0);
      if (dots) Dot.buildAndAttach([sn as any], { all: true });

      if (lyrics && lyrics[lyricIndex]) {
        const ann = new Annotation(lyrics[lyricIndex])
          .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
          .setVerticalJustification(AVJ.BOTTOM)
          .setJustification(AHJ.CENTER);
        sn.addModifier(ann, 0);
      }

      ticksOut.push(sn);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += durTicks;

      ni++;
      lyricIndex++;

      const isTriplet = q === 1/3 || q === 2/3 || q === 1/6;
      if (isTriplet) {
        const baseDur = q === 2/3 ? "q" : q === 1/3 ? "8" : "16";
        tripletBuf.push({ base: baseDur as Tok["dur"], note: sn });
        if (tripletBuf.length === 3) flush();
      } else {
        flush();
      }
    }

    flush();
    padToNextBar();
    return { ticks: ticksOut, starts: startsSec, tuplets };
  }

  // ----- Legacy fallback: infer from phrase seconds -----
  const notes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
  if (!notes.length) {
    const r = makeRest("w", clef);
    ticksOut.push(r);
    startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
    tTicks += 4 * PPQ;
  } else {
    let lyricIndex = 0;
    const tol = 1e-4;

    for (const n of notes) {
      const curSec = ticksToSeconds(tTicks, secPerQuarter);
      const gapSec = n.startSec - curSec;
      if (gapSec > tol) {
        for (const tok of secondsToTokens(gapSec, wnPerSec, "32")) {
          const rn = makeRest(tok.dur as any, clef);
          if (tok.dots) Dot.buildAndAttach([rn as any], { all: true });
          ticksOut.push(rn);
          startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
          tTicks += tokToTicks(tok);
        }
      }

      const toks = secondsToTokens(n.durSec, wnPerSec, "32");
      const { key, accidental } = midiToVexKey(n.midi, useSharps, keyMap || undefined);

      toks.forEach((tok, idx) => {
        const sn = new StaveNote({
          keys: [key],
          duration: tok.dur as any,
          clef,
          autoStem: false,
          stemDirection: 1,
        });
        if (accidental) sn.addModifier(new Accidental(accidental), 0);
        if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });

        if (idx === 0 && lyrics && lyrics[lyricIndex]) {
          const ann = new Annotation(lyrics[lyricIndex])
            .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
            .setVerticalJustification(AVJ.BOTTOM)
            .setJustification(AHJ.CENTER);
          sn.addModifier(ann, 0);
        }

        ticksOut.push(sn);
        startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
        tTicks += tokToTicks(tok);
      });

      lyricIndex++;
    }
  }

  padToNextBar();

  return { ticks: ticksOut, starts: startsSec, tuplets };
}

export function buildRhythmTickables(params: {
  rhythm?: RhythmEvent[];
  leadInSec: number;
  wnPerSec: number;
  secPerWholeNote: number;
  secPerBar: number;
}) {
  const { rhythm, leadInSec, wnPerSec, secPerWholeNote, secPerBar } = params;
  const secPerQuarter = secPerWholeNote / 4;

  const ticksOut: any[] = [];
  const startsSec: number[] = [];
  const tuplets: Tuplet[] = [];
  let tTicks = 0;

  const padToNextBar = () => {
    const curSec = ticksToSeconds(tTicks, secPerQuarter);
    const nextBarEnd = Math.ceil((curSec + 1e-9) / Math.max(1e-9, secPerBar)) * secPerBar;
    let need = nextBarEnd - curSec;
    if (need <= 1e-6) return;
    for (const tok of secondsToTokens(need, wnPerSec, "32")) {
      const r = makeRest(tok.dur as any, "bass");
      if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
      ticksOut.push(r);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += tokToTicks(tok);
    }
  };

  if (!Array.isArray(rhythm) || rhythm.length === 0) {
    padToNextBar();
    return { ticks: ticksOut, starts: startsSec, tuplets };
  }

  if (leadInSec > 1e-6) {
    for (const tok of secondsToTokens(leadInSec, wnPerSec, "32")) {
      const r = makeRest(tok.dur as any, "bass");
      if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
      ticksOut.push(r);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += tokToTicks(tok);
    }
  }

  let tripletBuf: { base: Tok["dur"]; note: StaveNote }[] = [];
  const flush = () => {
    for (let i = 0; i + 2 < tripletBuf.length; i += 3) {
      const a = tripletBuf[i], b = tripletBuf[i + 1], c = tripletBuf[i + 2];
      if (a.base === b.base && b.base === c.base) {
        tuplets.push(new Tuplet([a.note, b.note, c.note] as any, {
          bracketed: true,
          ratioed: false,
        }));
      }
    }
    tripletBuf = [];
  };

  for (const ev of rhythm as RhythmEvent[]) {
    const durTicks = noteValueToTicks(ev.value);
    const q = noteValueInQuarterUnits(ev.value);
    const { base, dots } = quarterToBaseAndDots(q);

    if (ev.type === "rest") {
      const rn = makeRest(base as any, "bass");
      if (dots) Dot.buildAndAttach([rn as any], { all: true });
      ticksOut.push(rn);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += durTicks;
      flush();
    } else {
      const sn = new StaveNote({
        keys: ["d/3"],
        duration: base as any,
        clef: "bass",
        autoStem: true,
      });
      if (dots) Dot.buildAndAttach([sn as any], { all: true });
      ticksOut.push(sn);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += durTicks;

      const isTriplet = q === 2/3 || q === 1/3 || q === 1/6;
      if (isTriplet) {
        const baseDur = q === 2/3 ? "q" : q === 1/3 ? "8" : "16";
        tripletBuf.push({ base: baseDur as Tok["dur"], note: sn });
        if (tripletBuf.length === 3) flush();
      } else {
        flush();
      }
    }
  }
  flush();

  padToNextBar();

  return { ticks: ticksOut, starts: startsSec, tuplets };
}
