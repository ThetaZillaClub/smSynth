// components/training/layout/sheet/vexscore/makeTickables.ts
import {
  StaveNote,
  GhostNote,
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

/** PPQ grid: 960 ticks per quarter */
const PPQ = 960;

/* ---------- helpers: ticks/quarters ---------- */
function ticksToSeconds(ticks: number, secPerQuarter: number): number {
  return (ticks / PPQ) * secPerQuarter;
}

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

function tokToTicks(tok: Tok): number {
  return Math.round(tokQuarterUnits(tok) * PPQ);
}

function noteValueToTicks(v: NoteValue): number {
  const q = noteValueInQuarterUnits(v);
  return Math.round(q * PPQ);
}

/* ---------- draw helpers ---------- */
function makeGhost(tok: Tok) {
  return new GhostNote(tokToDuration(tok)) as any;
}

function makeManualRest(
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

  // center measure rest; normal rests stay left-justified like notes
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

/* ---------- tokenization in TICKS for bar-accurate padding ---------- */
const TOK_LADDER: Tok[] = [
  { dur: "w", dots: 0 },      // 4q = 3840
  { dur: "h", dots: 1 },      // 3q = 2880
  { dur: "h", dots: 0 },      // 2q = 1920
  { dur: "q", dots: 1 },      // 1.5q = 1440
  { dur: "q", dots: 0 },      // 1q = 960
  { dur: "8", dots: 1 },      // 0.75q = 720
  { dur: "8", dots: 0 },      // 0.5q = 480
  { dur: "16", dots: 1 },     // 0.375q = 360
  { dur: "16", dots: 0 },     // 0.25q = 240
  { dur: "32", dots: 1 },     // 0.1875q = 180
  { dur: "32", dots: 0 },     // 0.125q = 120
];

function ticksToToks(remTicks: number): Tok[] {
  const toks: Tok[] = [];
  let r = Math.max(0, Math.round(remTicks));
  for (const t of TOK_LADDER) {
    const dt = tokToTicks(t);
    while (r >= dt) {
      toks.push(t);
      r -= dt;
    }
    if (r === 0) break;
  }
  return toks;
}

/* ---------- core builders ---------- */
export function buildMelodyTickables(params: {
  phrase: Phrase;
  clef: "treble" | "bass";
  useSharps: boolean;
  leadInSec: number;
  wnPerSec: number;
  secPerWholeNote: number;
  secPerBar: number;
  tsNum: number;
  den: number;
  lyrics?: string[];
  rhythm?: RhythmEvent[];
  keyAccidentals?: Record<"A"|"B"|"C"|"D"|"E"|"F"|"G", ""|"#"|"b"> | null;
}) {
  const {
    phrase,
    clef,
    useSharps,
    leadInSec,
    wnPerSec,
    secPerWholeNote,
    secPerBar,
    tsNum,
    den,
    lyrics,
    rhythm,
    keyAccidentals: keyMap,
  } = params;

  const secPerQuarter = secPerWholeNote / 4;
  const BAR_TICKS = Math.max(1, Math.round(tsNum * (4 / Math.max(1, den)) * PPQ));

  const ticksOut: any[] = [];
  const startsSec: number[] = [];
  const barIndex: number[] = [];
  const manualRests: Array<{ note: StaveNote; start: number; barIndex: number }> = [];
  const tuplets: Tuplet[] = [];
  let tTicks = 0;

  const pushManualRest = (note: StaveNote, start: number, bidx: number) => {
    manualRests.push({ note, start, barIndex: bidx });
  };

  const emitRestToks = (toks: Tok[], { visible = true }: { visible?: boolean } = {}) => {
    for (const tok of toks) {
      const start = ticksToSeconds(tTicks, secPerQuarter);
      const bidx = Math.floor(tTicks / BAR_TICKS);
      // timing-only ghost
      const g = makeGhost(tok);
      ticksOut.push(g);
      startsSec.push(start);
      barIndex.push(bidx);
      tTicks += tokToTicks(tok);

      if (visible) {
        const r = makeManualRest(tok.dur, tok.dots as 0|1|2, clef);
        pushManualRest(r, start, bidx);
      }
    }
  };

  const emitMeasureRestBar = () => {
    // push timing ghosts that sum to BAR_TICKS
    const toks = ticksToToks(BAR_TICKS);
    const start = ticksToSeconds(tTicks, secPerQuarter);
    const bidx = Math.floor(tTicks / BAR_TICKS);
    emitRestToks(toks, { visible: false }); // timing only
    // single centered whole-bar rest glyph
    const mr = makeManualRest("wr", 0, clef, { center: true });
    pushManualRest(mr, start, bidx);
  };

  const padToNextBarTicks = () => {
    const rem = tTicks % BAR_TICKS === 0 ? 0 : BAR_TICKS - (tTicks % BAR_TICKS);
    if (rem > 0) {
      const toks = ticksToToks(rem);
      emitRestToks(toks, { visible: false }); // timing-only padding — no glyphs
    }
  };

  // -------- LEAD-IN (bars) — exact tick math, with 1 centered glyph per full bar
  if (leadInSec > 1e-9) {
    const leadBarsFloat = (leadInSec / Math.max(1e-9, secPerBar));
    const fullBars = Math.floor(leadBarsFloat + 1e-9);
    const remSec = leadInSec - fullBars * secPerBar;

    for (let i = 0; i < fullBars; i++) emitMeasureRestBar();

    if (remSec > 1e-9) {
      const remTicks = Math.round((remSec / secPerQuarter) * PPQ);
      const toks = ticksToToks(remTicks);
      emitRestToks(toks, { visible: true }); // visible small rests for partial bar
    }
  }

  // -------- Rhythm-driven path
  if (Array.isArray(rhythm) && rhythm.length) {
    const melNotes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
    let ni = 0;
    let lyricIndex = 0;

    let tripletBuf: { base: Tok["dur"]; note: any }[] = [];
    const flush = () => {
      for (let i = 0; i + 2 < tripletBuf.length; i += 3) {
        const a = tripletBuf[i], b = tripletBuf[i + 1], c = tripletBuf[i + 2];
        if (a.base === b.base && b.base === c.base) {
          tuplets.push(new Tuplet([a.note, b.note, c.note] as any, { bracketed: true, ratioed: false }));
        }
      }
      tripletBuf = [];
    };

    for (const ev of rhythm) {
      const durTicks = noteValueToTicks(ev.value);
      const q = noteValueInQuarterUnits(ev.value);

      const start = ticksToSeconds(tTicks, secPerQuarter);
      const bidx = Math.floor(tTicks / BAR_TICKS);

      if (ev.type === "rest") {
        const toks = ticksToToks(durTicks);
        // visible rest tokens inside content bars
        for (const tok of toks) {
          const s = ticksToSeconds(tTicks, secPerQuarter);
          const bi = Math.floor(tTicks / BAR_TICKS);
          const g = makeGhost(tok);
          ticksOut.push(g);
          startsSec.push(s);
          barIndex.push(bi);
          tTicks += tokToTicks(tok);
          const r = makeManualRest(tok.dur, tok.dots as 0|1|2, clef);
          pushManualRest(r, s, bi);
        }
        flush();
        continue;
      }

      // pitched note
      const src = melNotes[ni] ?? melNotes[melNotes.length - 1] ?? null;
      const midi = src?.midi ?? 60;
      const { key, accidental } = midiToVexKey(midi, useSharps, keyMap || undefined);

      // choose a base duration for the head; timing is taken from durTicks with ghosts if needed
      // but here we emit a single head StaveNote sized by the largest non-dotted within this duration
      // then add extra ghosts if duration > head
      const headTok: Tok = q >= 1 ? { dur: "q", dots: 0 } : q >= 0.5 ? { dur: "8", dots: 0 } :
                           q >= 0.25 ? { dur: "16", dots: 0 } : { dur: "32", dots: 0 };
      const sn = new StaveNote({
        keys: [key],
        duration: headTok.dur as any,
        clef,
        autoStem: false,
        stemDirection: 1,
      });
      if (accidental) sn.addModifier(new Accidental(accidental), 0);

      if (lyrics && lyrics[lyricIndex]) {
        const ann = new Annotation(lyrics[lyricIndex])
          .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
          .setVerticalJustification(AVJ.BOTTOM)
          .setJustification(AHJ.CENTER);
        sn.addModifier(ann, 0);
      }

      // put the head into the voice timeline at the *current* start
      ticksOut.push(sn);
      startsSec.push(start);
      barIndex.push(bidx);

      // advance using full durTicks with zero-width ghosts after head
      const headTicks = tokToTicks(headTok);
      tTicks += headTicks;
      const tailTicks = Math.max(0, durTicks - headTicks);
      if (tailTicks) {
        const toks = ticksToToks(tailTicks);
        for (const tok of toks) {
          const s2 = ticksToSeconds(tTicks, secPerQuarter);
          const bi2 = Math.floor(tTicks / BAR_TICKS);
          const g = makeGhost(tok);
          ticksOut.push(g);
          startsSec.push(s2);
          barIndex.push(bi2);
          tTicks += tokToTicks(tok);
        }
      }

      // triplet grouping (visual only)
      const isTriplet = q === 4/3 || q === 2/3 || q === 1/3 || q === 1/6;
      if (isTriplet) {
        const baseDur = q === 4/3 ? "h" : q === 2/3 ? "q" : q === 1/3 ? "8" : "16";
        tripletBuf.push({ base: baseDur as Tok["dur"], note: sn });
        if (tripletBuf.length === 3) flush();
      } else {
        flush();
      }

      ni++;
      lyricIndex++;
    }

    flush();
    padToNextBarTicks(); // timing-only pad; cannot spill
    return { ticks: ticksOut, starts: startsSec, barIndex, tuplets, manualRests };
  }

  // -------- Fallback: phrase.seconds
  const notes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
  if (!notes.length) {
    // make one centered measure rest if we’re at bar start, otherwise visible partials
    if (tTicks % BAR_TICKS === 0) {
      emitMeasureRestBar();
    } else {
      const rem = BAR_TICKS - (tTicks % BAR_TICKS);
      const toks = ticksToToks(rem);
      emitRestToks(toks, { visible: true });
    }
  } else {
    let lyricIndex = 0;
    const tol = 1e-4;

    for (const n of notes) {
      const curSec = ticksToSeconds(tTicks, secPerQuarter);
      const gapSec = n.startSec - curSec;
      if (gapSec > tol) {
        const gapTicks = Math.round((gapSec / secPerQuarter) * PPQ);
        const toks = ticksToToks(gapTicks);
        emitRestToks(toks, { visible: true });
      }

      // split note duration to tokens; first token is the visible head
      const totalTicks = Math.round((n.durSec / secPerQuarter) * PPQ);
      const toks = ticksToToks(totalTicks);
      toks.forEach((tok, idx) => {
        const start = ticksToSeconds(tTicks, secPerQuarter);
        const bidx = Math.floor(tTicks / BAR_TICKS);

        if (idx === 0) {
          const { key, accidental } = midiToVexKey(n.midi, useSharps, keyMap || undefined);
          const sn = new StaveNote({
            keys: [key],
            duration: tok.dur as any,
            clef,
            autoStem: false,
            stemDirection: 1,
          });
          if (accidental) sn.addModifier(new Accidental(accidental), 0);
          if (tok.dots) Dot.buildAndAttach([sn as any], { all: true });

          if (lyrics && lyrics[lyricIndex]) {
            const ann = new Annotation(lyrics[lyricIndex])
              .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
              .setVerticalJustification(AVJ.BOTTOM)
              .setJustification(AHJ.CENTER);
            sn.addModifier(ann, 0);
          }

          ticksOut.push(sn);
        } else {
          const g = makeGhost(tok);
          ticksOut.push(g);
        }

        startsSec.push(start);
        barIndex.push(bidx);
        tTicks += tokToTicks(tok);
      });

      lyricIndex++;
    }
  }

  padToNextBarTicks();
  return { ticks: ticksOut, starts: startsSec, barIndex, tuplets, manualRests };
}

export function buildRhythmTickables(params: {
  rhythm?: RhythmEvent[];
  leadInSec: number;
  wnPerSec: number;
  secPerWholeNote: number;
  secPerBar: number;
  tsNum: number;
  den: number;
}) {
  const { rhythm, leadInSec, wnPerSec, secPerWholeNote, secPerBar, tsNum, den } = params;
  const secPerQuarter = secPerWholeNote / 4;
  const BAR_TICKS = Math.max(1, Math.round(tsNum * (4 / Math.max(1, den)) * PPQ));

  const ticksOut: any[] = [];
  const startsSec: number[] = [];
  const barIndex: number[] = [];
  const manualRests: Array<{ note: StaveNote; start: number; barIndex: number }> = [];
  const tuplets: Tuplet[] = [];
  let tTicks = 0;

  const pushManualRest = (note: StaveNote, start: number, bidx: number) => {
    manualRests.push({ note, start, barIndex: bidx });
  };

  const emitRestToks = (toks: Tok[], { visible = true }: { visible?: boolean } = {}) => {
    for (const tok of toks) {
      const start = ticksToSeconds(tTicks, secPerQuarter);
      const bidx = Math.floor(tTicks / BAR_TICKS);
      const g = makeGhost(tok);
      ticksOut.push(g);
      startsSec.push(start);
      barIndex.push(bidx);
      tTicks += tokToTicks(tok);

      if (visible) {
        const r = makeManualRest(tok.dur, tok.dots as 0|1|2, "bass");
        pushManualRest(r, start, bidx);
      }
    }
  };

  const emitMeasureRestBar = () => {
    const toks = ticksToToks(BAR_TICKS);
    const start = ticksToSeconds(tTicks, secPerQuarter);
    const bidx = Math.floor(tTicks / BAR_TICKS);
    emitRestToks(toks, { visible: false }); // timing only
    const mr = makeManualRest("wr", 0, "bass", { center: true });
    pushManualRest(mr, start, bidx);
  };

  const padToNextBarTicks = () => {
    const rem = tTicks % BAR_TICKS === 0 ? 0 : BAR_TICKS - (tTicks % BAR_TICKS);
    if (rem > 0) {
      const toks = ticksToToks(rem);
      emitRestToks(toks, { visible: false }); // timing-only
    }
  };

  // Lead-in bars as single centered rests
  if (leadInSec > 1e-9) {
    const leadBarsFloat = (leadInSec / Math.max(1e-9, secPerBar));
    const fullBars = Math.floor(leadBarsFloat + 1e-9);
    const remSec = leadInSec - fullBars * secPerBar;

    for (let i = 0; i < fullBars; i++) emitMeasureRestBar();

    if (remSec > 1e-9) {
      const remTicks = Math.round((remSec / secPerQuarter) * PPQ);
      const toks = ticksToToks(remTicks);
      emitRestToks(toks, { visible: true });
    }
  }

  if (!Array.isArray(rhythm) || rhythm.length === 0) {
    padToNextBarTicks();
    return { ticks: ticksOut, starts: startsSec, barIndex, tuplets, manualRests };
  }

  let tripletBuf: { base: Tok["dur"]; note: any }[] = [];
  const flush = () => {
    for (let i = 0; i + 2 < tripletBuf.length; i += 3) {
      const a = tripletBuf[i], b = tripletBuf[i + 1], c = tripletBuf[i + 2];
      if (a.base === b.base && b.base === c.base) {
        tuplets.push(new Tuplet([a.note, b.note, c.note] as any, { bracketed: true, ratioed: false }));
      }
    }
    tripletBuf = [];
  };

  for (const ev of rhythm) {
    const durTicks = noteValueToTicks(ev.value);
    const q = noteValueInQuarterUnits(ev.value);

    const start = ticksToSeconds(tTicks, secPerQuarter);
    const bidx = Math.floor(tTicks / BAR_TICKS);

    if (ev.type === "rest") {
      const toks = ticksToToks(durTicks);
      for (const tok of toks) {
        const s = ticksToSeconds(tTicks, secPerQuarter);
        const bi = Math.floor(tTicks / BAR_TICKS);
        const g = makeGhost(tok);
        ticksOut.push(g);
        startsSec.push(s);
        barIndex.push(bi);
        tTicks += tokToTicks(tok);
        const r = makeManualRest(tok.dur, tok.dots as 0|1|2, "bass");
        pushManualRest(r, s, bi);
      }
      flush();
      continue;
    }

    const sn = new StaveNote({
      keys: ["d/3"],
      duration: (q >= 1 ? "q" : q >= 0.5 ? "8" : q >= 0.25 ? "16" : "32") as any,
      clef: "bass",
      autoStem: true,
    });
    ticksOut.push(sn);
    startsSec.push(start);
    barIndex.push(bidx);

    const headTicks = tokToTicks({ dur: sn.getDuration() as any, dots: 0 });
    tTicks += headTicks;
    const tailTicks = Math.max(0, durTicks - headTicks);
    if (tailTicks) {
      const toks = ticksToToks(tailTicks);
      for (const tok of toks) {
        const s2 = ticksToSeconds(tTicks, secPerQuarter);
        const bi2 = Math.floor(tTicks / BAR_TICKS);
        const g = makeGhost(tok);
        ticksOut.push(g);
        startsSec.push(s2);
        barIndex.push(bi2);
        tTicks += tokToTicks(tok);
      }
    }

    const isTriplet = q === 2/3 || q === 1/3 || q === 1/6;
    if (isTriplet) {
      const baseDur = q === 2/3 ? "q" : q === 1/3 ? "8" : "16";
      tripletBuf.push({ base: baseDur as Tok["dur"], note: sn });
      if (tripletBuf.length === 3) flush();
    } else {
      flush();
    }
  }

  flush();
  padToNextBarTicks();
  return { ticks: ticksOut, starts: startsSec, barIndex, tuplets, manualRests };
}
