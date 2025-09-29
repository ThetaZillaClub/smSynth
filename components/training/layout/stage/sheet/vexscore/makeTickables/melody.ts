// components/training/layout/stage/sheet/vexscore/makeTickables/melody.ts
import {
  StaveNote,
  Accidental,
  Dot,
  Tuplet,
  Annotation,
  AnnotationHorizontalJustify as AHJ,
  AnnotationVerticalJustify as AVJ,
} from "vexflow";
import type { Tickable } from "vexflow";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/generator";
import { noteValueInQuarterUnits } from "@/utils/time/tempo";
import { midiToVexKey, type Tok } from "../builders";

// 🔧 Use alias path so TS reliably resolves this module
import {
  PPQ,
  ticksToSeconds,
  tokToTicks,
  ticksToToks,
  noteValueToTicks,
} from "@/components/training/layout/stage/sheet/vexscore/makeTickables/time";

import { makeGhost, makeManualRest, makeInvisibleTripletRest } from "./draw";
import { TripletSlot, tripletBaseForQ, buildTupletFromSlots } from "./tuplets";

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
  keyAccidentals?: Record<"A" | "B" | "C" | "D" | "E" | "F" | "G", "" | "#" | "b"> | null;
}) {
  const {
    phrase,
    clef,
    useSharps,
    leadInSec,
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

  const ticksOut: Tickable[] = [];
  const startsSec: number[] = [];
  const barIndex: number[] = [];
  const manualRests: Array<{ note: StaveNote; start: number; barIndex: number }> = [];
  const tuplets: Tuplet[] = [];
  let tTicks = 0;

  const pushManualRest = (note: StaveNote, start: number, bidx: number) => {
    manualRests.push({ note, start, barIndex: bidx });
  };
  const appendTickable = (n: Tickable, start: number, bidx: number) => {
    ticksOut.push(n);
    startsSec.push(start);
    barIndex.push(bidx);
  };

  const emitRestToks = (toks: Tok[], { visible = true }: { visible?: boolean } = {}) => {
    for (const tok of toks) {
      const start = ticksToSeconds(tTicks, secPerQuarter);
      const bidx = Math.floor(tTicks / BAR_TICKS);
      const g = makeGhost(tok);
      appendTickable(g, start, bidx);
      tTicks += tokToTicks(tok);
      if (visible) {
        const r = makeManualRest(tok.dur, tok.dots as 0 | 1 | 2, clef);
        pushManualRest(r, start, bidx);
      }
    }
  };

  const emitMeasureRestBar = () => {
    const start = ticksToSeconds(tTicks, secPerQuarter);
    const bidx = Math.floor(tTicks / BAR_TICKS);
    emitRestToks(ticksToToks(BAR_TICKS), { visible: false }); // timing only
    const mr = makeManualRest("wr", 0, clef, { center: true });
    pushManualRest(mr, start, bidx);
  };

  const padToNextBarTicks = () => {
    const rem = tTicks % BAR_TICKS === 0 ? 0 : BAR_TICKS - (tTicks % BAR_TICKS);
    if (rem > 0) emitRestToks(ticksToToks(rem), { visible: false });
  };

  // Lead-in (bars)
  if (leadInSec > 1e-9) {
    const leadBarsFloat = leadInSec / Math.max(1e-9, secPerBar);
    const fullBars = Math.floor(leadBarsFloat + 1e-9);
    const remSec = leadInSec - fullBars * secPerBar;
    for (let i = 0; i < fullBars; i++) emitMeasureRestBar();
    if (remSec > 1e-9)
      emitRestToks(ticksToToks(Math.round((remSec / secPerQuarter) * PPQ)), { visible: true });
  }

  // -------- Rhythm-driven path
  if (Array.isArray(rhythm) && rhythm.length) {
    const melNotes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
    let ni = 0;
    let lyricIndex = 0;

    let tripletBuf: TripletSlot[] = [];
    const flush = (forceAll = false) => {
      while (tripletBuf.length >= 3) {
        const group = tripletBuf.slice(0, 3);
        buildTupletFromSlots(group, tuplets);
        tripletBuf.splice(0, 3);
      }
      if (forceAll) tripletBuf = [];
    };

    for (const ev of rhythm) {
      const durTicks = noteValueToTicks(ev.value);
      const q = noteValueInQuarterUnits(ev.value);
      const tripBase = tripletBaseForQ(q);

      const start = ticksToSeconds(tTicks, secPerQuarter);
      const bidx = Math.floor(tTicks / BAR_TICKS);

      if (ev.type === "rest") {
        if (tripBase) {
          const restTick = makeInvisibleTripletRest(tripBase, clef);
          appendTickable(restTick, start, bidx);
          pushManualRest(makeManualRest(tripBase, 0, clef), start, bidx);
          tTicks += durTicks;
          tripletBuf.push({ base: tripBase, node: restTick, start, barIdx: bidx });
          if (tripletBuf.length >= 3) flush();
        } else {
          const toks = ticksToToks(durTicks);
          for (const tok of toks) {
            const s = ticksToSeconds(tTicks, secPerQuarter);
            const bi = Math.floor(tTicks / BAR_TICKS);
            appendTickable(makeGhost(tok), s, bi);
            tTicks += tokToTicks(tok);
            pushManualRest(makeManualRest(tok.dur, tok.dots as 0 | 1 | 2, clef), s, bi);
          }
          flush(true);
        }
        continue;
      }

      // pitched note
      const src = melNotes[ni] ?? melNotes[melNotes.length - 1] ?? null;
      const midi = src?.midi ?? 60;
      const { key, accidental } = midiToVexKey(midi, useSharps, keyMap || undefined);

      let headTok: Tok;
      if (tripBase) {
        headTok = { dur: tripBase, dots: 0 } as Tok;
      } else {
        const toks = ticksToToks(durTicks);
        headTok = toks[0] ?? { dur: "q", dots: 0 };
      }

      const sn = new StaveNote({
        keys: [key],
        duration: headTok.dur as string,
        clef,
        autoStem: false,
        stemDirection: 1,
      });
      if (accidental) sn.addModifier(new Accidental(accidental), 0);
      if (headTok.dots) Dot.buildAndAttach([sn], { all: true });

      if (lyrics && lyrics[lyricIndex]) {
        const ann = new Annotation(lyrics[lyricIndex])
          .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
          .setVerticalJustification(AVJ.BOTTOM)
          .setJustification(AHJ.CENTER);
        sn.addModifier(ann, 0);
      }

      appendTickable(sn, start, bidx);

      if (tripBase) {
        tTicks += durTicks;
        tripletBuf.push({ base: tripBase, node: sn, start, barIdx: bidx });
        if (tripletBuf.length >= 3) flush();
      } else {
        const headTicks = tokToTicks(headTok);
        tTicks += headTicks;

        const tailTicks = Math.max(0, durTicks - headTicks);
        if (tailTicks) {
          const tailToks = ticksToToks(tailTicks);
          tailToks.forEach((tok: Tok) => {
            const s2 = ticksToSeconds(tTicks, secPerQuarter);
            const bi2 = Math.floor(tTicks / BAR_TICKS);
            appendTickable(makeGhost(tok), s2, bi2);
            tTicks += tokToTicks(tok);
          });
        }
        flush(true);
      }

      ni++;
      lyricIndex++;
    }

    flush(true);
    padToNextBarTicks();
    return { ticks: ticksOut, starts: startsSec, barIndex, tuplets, manualRests };
  }

  // -------- Fallback: phrase.seconds
  const notes = [...(phrase?.notes ?? [])].sort((a, b) => a.startSec - b.startSec);
  if (!notes.length) {
    if (tTicks % BAR_TICKS === 0) {
      emitMeasureRestBar();
    } else {
      emitRestToks(ticksToToks(BAR_TICKS - (tTicks % BAR_TICKS)), { visible: true });
    }
  } else {
    let lyricIndex = 0;
    const tol = 1e-4;

    for (const n of notes) {
      const curSec = ticksToSeconds(tTicks, secPerQuarter);
      const gapSec = n.startSec - curSec;
      if (gapSec > tol) {
        const gapTicks = Math.round((gapSec / secPerQuarter) * PPQ);
        emitRestToks(ticksToToks(gapTicks), { visible: true });
      }

      const totalTicks = Math.round((n.durSec / secPerQuarter) * PPQ);
      const toks = ticksToToks(totalTicks);
      toks.forEach((tok: Tok, idx: number) => {
        const start = ticksToSeconds(tTicks, secPerQuarter);
        const bidx = Math.floor(tTicks / BAR_TICKS);

        if (idx === 0) {
          const { key, accidental } = midiToVexKey(n.midi, useSharps, keyMap || undefined);
          const sn = new StaveNote({
            keys: [key],
            duration: tok.dur as string,
            clef,
            autoStem: false,
            stemDirection: 1,
          });
          if (accidental) sn.addModifier(new Accidental(accidental), 0);
          if (tok.dots) Dot.buildAndAttach([sn], { all: true });

          if (lyrics && lyrics[lyricIndex]) {
            const ann = new Annotation(lyrics[lyricIndex])
              .setFont("ui-sans-serif, system-ui, -apple-system, Segoe UI", 12, "")
              .setVerticalJustification(AVJ.BOTTOM)
              .setJustification(AHJ.CENTER);
            sn.addModifier(ann, 0);
          }

          appendTickable(sn, start, bidx);
        } else {
          appendTickable(makeGhost(tok), start, bidx);
        }

        tTicks += tokToTicks(tok);
      });

      lyricIndex++;
    }
  }

  padToNextBarTicks();
  return { ticks: ticksOut, starts: startsSec, barIndex, tuplets, manualRests };
}
