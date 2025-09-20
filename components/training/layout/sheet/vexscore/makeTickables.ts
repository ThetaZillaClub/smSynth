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
  tokToDuration,
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
  const q = noteValueInQuarterUnits(v); // exact rational for all supported values
  return Math.round(q * PPQ);           // stays integer (e.g., triplet-8th = 320)
}

/** staff rest for a clef (visible) */
function makeRest(duration: string, clef: "treble" | "bass") {
  const key = clef === "treble" ? "b/4" : "d/3";
  return new StaveNote({ keys: [key], duration: (duration + "r") as any, clef, autoStem: true });
}

/**
 * Build MELODY tickables.
 * If `rhythm` is provided, it is treated as authoritative for bar math (exact),
 * so note/rest durations are taken directly from it (with tuplets when needed).
 * Otherwise, we infer durations from phrase note seconds (legacy path).
 *
 * IMPORTANT: All timing is accumulated as integer PPQ ticks, then converted
 * to seconds once at the end. This removes floating-time boundary errors.
 *
 * Additionally, we **pad with visible rests to the next barline** using `secPerBar`,
 * so measures are never visually short even if the material ends early.
 *
 * Also: we force **stems up** on melody so flags always point upward.
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
  /** When provided, this is the authoritative rhythm for the melody's durations. */
  rhythm?: RhythmEvent[];
}) {
  const {
    phrase,
    clef,
    useSharps,
    leadInSec,
    wnPerSec,
    secPerWholeNote,
    secPerBeat,
    secPerBar,
    lyrics,
    rhythm,
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
      const r = makeRest(tokToDuration(tok), clef);
      if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
      ticksOut.push(r);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += tokToTicks(tok);
    }
  };

  // --- lead-in as rests (tokenized, then timed in PPQ) ---
  if (leadInSec > 1e-6) {
    for (const tok of secondsToTokens(leadInSec, wnPerSec, "32")) {
      const r = makeRest(tokToDuration(tok), clef);
      if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
      ticksOut.push(r);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += tokToTicks(tok);
    }
  }

  // ----- Exact rhythm-driven path (preferred): keeps bar math exact -----
  if (Array.isArray(rhythm) && rhythm.length) {
    const melNotes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
    let ni = 0; // index into melody notes (advance on NOTE events)
    let lyricIndex = 0;

    // Triplet capture per 3 notes of the same base kind (using NoteValue classification)
    let tripletBuf: { base: Tok["dur"]; note: StaveNote }[] = [];
    const flush = () => {
      for (let i = 0; i + 2 < tripletBuf.length; i += 3) {
        const a = tripletBuf[i], b = tripletBuf[i + 1], c = tripletBuf[i + 2];
        if (a.base === b.base && b.base === c.base) tuplets.push(new Tuplet([a.note, b.note, c.note] as any));
      }
      tripletBuf = [];
    };

    for (const ev of rhythm) {
      const durTicks = noteValueToTicks(ev.value);

      if (ev.type === "rest") {
        // basic display mapping (timing controlled by durTicks)
        const q = noteValueInQuarterUnits(ev.value);
        const durStr =
          q === 4 ? "w" :
          q === 3 ? "hd" :
          q === 2 ? "h" :
          q === 1.5 ? "qd" :
          q === 1 ? "q" :
          q === 0.75 ? "8d" :
          q === 2/3 ? "q" :
          q === 0.5 ? "8" :
          q === 3/8 ? "16d" :
          q === 1/3 ? "8" :
          q === 0.25 ? "16" :
          q === 1/6 ? "16" :
          q === 0.125 ? "32" : "8";

        const rn = makeRest(durStr as any, clef);
        ticksOut.push(rn);
        startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
        tTicks += durTicks;
        flush();
        continue;
      }

      // Choose next melody pitch; if we run out, repeat the last, fallback to C4.
      const src = melNotes[ni] ?? melNotes[melNotes.length - 1] ?? null;
      const midi = src?.midi ?? 60;
      const { key, accidental } = midiToVexKey(midi, useSharps);

      // Visual duration string (timing driven by ticks)
      const q = noteValueInQuarterUnits(ev.value);
      const durStr =
        q === 4 ? "w" :
        q === 3 ? "hd" :
        q === 2 ? "h" :
        q === 1.5 ? "qd" :
        q === 1 ? "q" :
        q === 0.75 ? "8d" :
        q === 2/3 ? "q" :
        q === 0.5 ? "8" :
        q === 3/8 ? "16d" :
        q === 1/3 ? "8" :
        q === 0.25 ? "16" :
        q === 1/6 ? "16" :
        q === 0.125 ? "32" : "8";

      const sn = new StaveNote({
        keys: [key],
        duration: durStr as any,
        clef,
        autoStem: false,
        stemDirection: 1,   // force stems/flags up
      });
      if (accidental) sn.addModifier(new Accidental(accidental), 0);

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

      // Triplet grouping
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
    // Ensure we fill to the next bar with rests so the bar isn’t visually short
    padToNextBar();
    return { ticks: ticksOut, starts: startsSec, tuplets };
  }

  // ----- Legacy fallback: infer from phrase seconds (kept for compatibility) -----
  const notes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
  if (!notes.length) {
    const r = makeRest("w", clef);
    ticksOut.push(r);
    startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
    tTicks += 4 * PPQ; // whole note
  } else {
    let lyricIndex = 0;
    const tol = 1e-4;

    for (const n of notes) {
      // --- fill gaps with rests (32nd resolution) ---
      const curSec = ticksToSeconds(tTicks, secPerQuarter);
      const gapSec = n.startSec - curSec;
      if (gapSec > tol) {
        for (const tok of secondsToTokens(gapSec, wnPerSec, "32")) {
          const rn = makeRest(tokToDuration(tok), clef);
          if (tok.dots) Dot.buildAndAttach([rn as any], { all: true });
          ticksOut.push(rn);
          startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
          tTicks += tokToTicks(tok);
        }
      }

      // --- split note duration into tokens (32nd resolution) ---
      const toks = secondsToTokens(n.durSec, wnPerSec, "32");
      const { key, accidental } = midiToVexKey(n.midi, useSharps);

      toks.forEach((tok, idx) => {
        const sn = new StaveNote({
          keys: [key],
          duration: tokToDuration(tok),
          clef,
          autoStem: false,
          stemDirection: 1, // force stems/flags up
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

  // Pad with visible rests to complete the bar
  padToNextBar();

  return { ticks: ticksOut, starts: startsSec, tuplets };
}

export function buildRhythmTickables(params: {
  rhythm?: RhythmEvent[];
  leadInSec: number;
  wnPerSec: number;
  secPerWholeNote: number;
  secPerBar: number;          // used to pad to bar boundaries
}) {
  const { rhythm, leadInSec, wnPerSec, secPerWholeNote, secPerBar } = params;
  const secPerQuarter = secPerWholeNote / 4;

  const ticksOut: any[] = [];
  const startsSec: number[] = [];
  const tuplets: Tuplet[] = [];
  let tTicks = 0;

  // Helper: pad to next bar with visible rests on the rhythm staff (bass)
  const padToNextBar = () => {
    const curSec = ticksToSeconds(tTicks, secPerQuarter);
    const nextBarEnd = Math.ceil((curSec + 1e-9) / Math.max(1e-9, secPerBar)) * secPerBar;
    let need = nextBarEnd - curSec;
    if (need <= 1e-6) return;
    for (const tok of secondsToTokens(need, wnPerSec, "32")) {
      const r = makeRest(tokToDuration(tok), "bass");
      if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
      ticksOut.push(r);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += tokToTicks(tok);
    }
  };

  if (!Array.isArray(rhythm) || rhythm.length === 0) {
    // No rhythm: still ensure a full bar of rests so the measure isn't empty
    padToNextBar();
    return { ticks: ticksOut, starts: startsSec, tuplets };
  }

  // --- rhythm lead-in as *visible rests* (32nd resolution) ---
  if (leadInSec > 1e-6) {
    for (const tok of secondsToTokens(leadInSec, wnPerSec, "32")) {
      const r = makeRest(tokToDuration(tok), "bass");
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
      if (a.base === b.base && b.base === c.base) tuplets.push(new Tuplet([a.note, b.note, c.note] as any));
    }
    tripletBuf = [];
  };

  for (const ev of rhythm as RhythmEvent[]) {
    const durTicks = noteValueToTicks(ev.value);
    const q = noteValueInQuarterUnits(ev.value);
    // map exact musical value → VexFlow duration string
    const durStr =
      q === 4 ? "w" :
      q === 3 ? "hd" :
      q === 2 ? "h" :
      q === 1.5 ? "qd" :
      q === 1 ? "q" :
      q === 0.75 ? "8d" :
      q === 2/3 ? "q" :
      q === 0.5 ? "8" :
      q === 3/8 ? "16d" :
      q === 1/3 ? "8" :
      q === 0.25 ? "16" :
      q === 1/6 ? "16" :
      q === 0.125 ? "32" : "8";

    if (ev.type === "rest") {
      const rn = makeRest(durStr as any, "bass"); // show real rest length → proper flags
      ticksOut.push(rn);
      startsSec.push(ticksToSeconds(tTicks, secPerQuarter));
      tTicks += durTicks;
      flush(); // rests break triplet groups
    } else {
      // neutral percussion-like head position on bass staff
      const sn = new StaveNote({
        keys: ["d/3"],
        duration: durStr as any,
        clef: "bass",
        autoStem: true,
      });
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

  // Pad the last bar with visible rests so it ends exactly on the barline
  padToNextBar();

  return { ticks: ticksOut, starts: startsSec, tuplets };
}
