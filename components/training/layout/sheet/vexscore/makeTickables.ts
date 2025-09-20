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
  tokToSeconds,
  mapNoteValue,
  type Tok,
} from "./builders";

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
 */
export function buildMelodyTickables(params: {
  phrase: Phrase;
  clef: "treble" | "bass";
  useSharps: boolean;
  leadInSec: number;
  wnPerSec: number;
  secPerWholeNote: number;
  secPerBeat: number;
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
    lyrics,
    rhythm,
  } = params;

  const ticks: any[] = [];
  const starts: number[] = [];
  const tuplets: Tuplet[] = [];
  let t = 0;

  // --- lead-in as rests (32nd resolution) ---
  if (leadInSec > 1e-6) {
    for (const tok of secondsToTokens(leadInSec, wnPerSec, "32")) {
      const r = makeRest(tokToDuration(tok), clef);
      if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
      ticks.push(r);
      starts.push(t);
      t += tokToSeconds(tok, secPerWholeNote);
    }
  }

  // ----- Exact rhythm-driven path (preferred): keeps bar math exact -----
  if (Array.isArray(rhythm) && rhythm.length) {
    // We'll take pitch material from the phrase notes (in order),
    // but durations/rests come from rhythm events exactly.
    const melNotes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
    let ni = 0; // index into melody notes (advance on NOTE events)
    let lyricIndex = 0;

    // Collect triplets by base token in groups of three.
    let tripletBuf: { base: Tok["dur"]; note: StaveNote }[] = [];
    const flush = () => {
      for (let i = 0; i + 2 < tripletBuf.length; i += 3) {
        const a = tripletBuf[i],
          b = tripletBuf[i + 1],
          c = tripletBuf[i + 2];
        if (a.base === b.base && b.base === c.base) tuplets.push(new Tuplet([a.note, b.note, c.note] as any));
      }
      tripletBuf = [];
    };

    for (const ev of rhythm) {
      const { tok, triplet } = mapNoteValue(ev.value as NoteValue);
      const dur = tokToDuration(tok);
      const tokSec = tokToSeconds(tok, secPerWholeNote, !!triplet);

      if (ev.type === "rest") {
        const rn = makeRest(dur, clef);
        if (tok.dots) Dot.buildAndAttach([rn as any], { all: true });
        ticks.push(rn);
        starts.push(t);
        t += tokSec;
        // rests break tuplets
        flush();
        continue;
      }

      // Choose next melody pitch; if we run out, repeat the last, fallback to C4.
      const src = melNotes[ni] ?? melNotes[melNotes.length - 1] ?? null;
      const midi = src?.midi ?? 60;
      const { key, accidental } = midiToVexKey(midi, useSharps);

      const sn = new StaveNote({ keys: [key], duration: dur, clef, autoStem: true });
      if (accidental) sn.addModifier(new Accidental(accidental), 0);
      if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });

      // One lyric per NOTE event (rhythm-driven), centered on the notehead.
      if (lyrics && lyrics[lyricIndex]) {
        const ann = new Annotation(lyrics[lyricIndex])
          .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
          .setVerticalJustification(AVJ.BOTTOM)
          .setJustification(AHJ.CENTER);
        sn.addModifier(ann, 0);
      }

      ticks.push(sn);
      starts.push(t);
      t += tokSec;

      ni++;
      lyricIndex++;

      if (triplet) {
        tripletBuf.push({ base: tok.dur, note: sn });
        if (tripletBuf.length === 3) flush();
      } else {
        flush();
      }
    }

    // final flush in case of leftover (non-multiple of 3 won't form a tuplet)
    flush();

    return { ticks, starts, tuplets };
  }

  // ----- Legacy fallback: infer from phrase seconds (kept for compatibility) -----
  const notes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
  if (!notes.length) {
    const r = makeRest("w", clef);
    ticks.push(r);
    starts.push(t);
    t += 4 * secPerBeat;
  } else {
    let lyricIndex = 0;
    const tol = 1e-4;

    for (const n of notes) {
      // --- fill gaps with rests (32nd resolution) ---
      const gap = n.startSec - t;
      if (gap > tol) {
        for (const tok of secondsToTokens(gap, wnPerSec, "32")) {
          const rn = makeRest(tokToDuration(tok), clef);
          if (tok.dots) Dot.buildAndAttach([rn as any], { all: true });
          ticks.push(rn);
          starts.push(t);
          t += tokToSeconds(tok, secPerWholeNote);
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
          autoStem: true,
        });
        if (accidental) sn.addModifier(new Accidental(accidental), 0);
        if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });

        // Only place lyric on the first sub-token of the note
        if (idx === 0 && lyrics && lyrics[lyricIndex]) {
          const ann = new Annotation(lyrics[lyricIndex])
            .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
            .setVerticalJustification(AVJ.BOTTOM)
            .setJustification(AHJ.CENTER);
          sn.addModifier(ann, 0);
        }

        ticks.push(sn);
        starts.push(t);
        t += tokToSeconds(tok, secPerWholeNote);
      });

      lyricIndex++;
    }
  }

  return { ticks, starts, tuplets };
}

export function buildRhythmTickables(params: {
  rhythm?: RhythmEvent[];
  leadInSec: number;
  wnPerSec: number;
  secPerWholeNote: number;
}) {
  const { rhythm, leadInSec, wnPerSec, secPerWholeNote } = params;
  const ticks: any[] = [];
  const starts: number[] = [];
  const tuplets: Tuplet[] = [];
  let t = 0;

  if (!Array.isArray(rhythm) || rhythm.length === 0) return { ticks, starts, tuplets };

  // --- rhythm lead-in as *visible rests* (32nd resolution) ---
  if (leadInSec > 1e-6) {
    for (const tok of secondsToTokens(leadInSec, wnPerSec, "32")) {
      const r = makeRest(tokToDuration(tok), "bass");
      if (tok.dots) Dot.buildAndAttach([r as any], { all: true });
      ticks.push(r);
      starts.push(t);
      t += tokToSeconds(tok, secPerWholeNote);
    }
  }

  let tripletBuf: { base: Tok["dur"]; note: StaveNote }[] = [];
  const flush = () => {
    for (let i = 0; i + 2 < tripletBuf.length; i += 3) {
      const a = tripletBuf[i],
        b = tripletBuf[i + 1],
        c = tripletBuf[i + 2];
      if (a.base === b.base && b.base === c.base) tuplets.push(new Tuplet([a.note, b.note, c.note] as any));
    }
    tripletBuf = [];
  };

  for (const ev of rhythm as RhythmEvent[]) {
    const { tok, triplet } = mapNoteValue(ev.value as NoteValue);
    const dur = tokToDuration(tok);
    const tokSec = tokToSeconds(tok, secPerWholeNote, !!triplet);

    if (ev.type === "rest") {
      const rn = makeRest(dur, "bass");
      if (tok.dots) Dot.buildAndAttach([rn as any], { all: true });
      ticks.push(rn);
      starts.push(t);
      t += tokSec;
      flush();
    } else {
      const sn = new StaveNote({ keys: ["d/3"], duration: dur, clef: "bass", autoStem: true });
      if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });
      ticks.push(sn);
      starts.push(t);
      t += tokSec;

      if (triplet) {
        tripletBuf.push({ base: tok.dur, note: sn });
        if (tripletBuf.length === 3) flush();
      } else flush();
    }
  }
  flush();

  return { ticks, starts, tuplets };
}
