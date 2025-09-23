// components/training/layout/sheet/vexscore/makeTickables/rhythm.ts
import { StaveNote, Dot, Tuplet } from "vexflow";
import type { RhythmEvent } from "@/utils/phrase/generator";
import { noteValueInQuarterUnits } from "@/utils/time/tempo";
import { type Tok } from "../builders";
import {
  PPQ, ticksToSeconds, tokToTicks, ticksToToks, noteValueToTicks,
} from "./time";
import {
  makeGhost, makeManualRest, makeInvisibleTripletRest,
} from "./draw";
import {
  TripletSlot, tripletBaseForQ, buildTupletFromSlots,
} from "./tuplets";

export function buildRhythmTickables(params: {
  rhythm?: RhythmEvent[];
  leadInSec: number;
  wnPerSec: number;
  secPerWholeNote: number;
  secPerBar: number;
  tsNum: number;
  den: number;
}) {
  const { rhythm, leadInSec, secPerWholeNote, secPerBar, tsNum, den } = params;
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
  const appendTickable = (n: any, start: number, bidx: number) => {
    ticksOut.push(n);
    startsSec.push(start);
    barIndex.push(bidx);
  };

  const emitRestToks = (toks: Tok[], { visible = true }: { visible?: boolean } = {}) => {
    for (const tok of toks) {
      const start = ticksToSeconds(tTicks, secPerQuarter);
      const bidx = Math.floor(tTicks / BAR_TICKS);
      appendTickable(makeGhost(tok) as any, start, bidx);
      tTicks += tokToTicks(tok);
      if (visible) pushManualRest(makeManualRest(tok.dur, tok.dots as 0 | 1 | 2, "bass"), start, bidx);
    }
  };

  const emitMeasureRestBar = () => {
    const start = ticksToSeconds(tTicks, secPerQuarter);
    const bidx = Math.floor(tTicks / BAR_TICKS);
    emitRestToks(ticksToToks(BAR_TICKS), { visible: false }); // timing only
    pushManualRest(makeManualRest("wr", 0, "bass", { center: true }), start, bidx);
  };

  const padToNextBarTicks = () => {
    const rem = tTicks % BAR_TICKS === 0 ? 0 : BAR_TICKS - (tTicks % BAR_TICKS);
    if (rem > 0) emitRestToks(ticksToToks(rem), { visible: false });
  };

  // Lead-in
  if (leadInSec > 1e-9) {
    const leadBarsFloat = leadInSec / Math.max(1e-9, secPerBar);
    const fullBars = Math.floor(leadBarsFloat + 1e-9);
    const remSec = leadInSec - fullBars * secPerBar;
    for (let i = 0; i < fullBars; i++) emitMeasureRestBar();
    if (remSec > 1e-9) emitRestToks(ticksToToks(Math.round((remSec / secPerQuarter) * PPQ)), { visible: true });
  }

  if (!Array.isArray(rhythm) || rhythm.length === 0) {
    padToNextBarTicks();
    return { ticks: ticksOut, starts: startsSec, barIndex, tuplets, manualRests };
  }

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
        const restTick = makeInvisibleTripletRest(tripBase, "bass");
        appendTickable(restTick, start, bidx);
        pushManualRest(makeManualRest(tripBase, 0, "bass"), start, bidx);
        tTicks += durTicks;
        tripletBuf.push({ base: tripBase, node: restTick, start, barIdx: bidx });
        if (tripletBuf.length >= 3) flush();
      } else {
        for (const tok of ticksToToks(durTicks)) {
          const s = ticksToSeconds(tTicks, secPerQuarter);
          const bi = Math.floor(tTicks / BAR_TICKS);
          appendTickable(makeGhost(tok) as any, s, bi);
          tTicks += tokToTicks(tok);
          pushManualRest(makeManualRest(tok.dur, tok.dots as 0 | 1 | 2, "bass"), s, bi);
        }
        flush(true);
      }
      continue;
    }

    // note slot (unpitched)
    let headTok: Tok;
    if (tripBase) {
      headTok = { dur: tripBase, dots: 0 } as Tok;
    } else {
      const toks = ticksToToks(durTicks);
      headTok = toks[0] ?? { dur: "q", dots: 0 };
    }

    const sn = new StaveNote({
      keys: ["d/3"],
      duration: headTok.dur as any,
      clef: "bass",
      autoStem: true,
    });
    if (headTok.dots) Dot.buildAndAttach([sn as any], { all: true });

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
        for (const tok of ticksToToks(tailTicks)) {
          const s2 = ticksToSeconds(tTicks, secPerQuarter);
          const bi2 = Math.floor(tTicks / BAR_TICKS);
          appendTickable(makeGhost(tok) as any, s2, bi2);
          tTicks += tokToTicks(tok);
        }
      }
      flush(true);
    }
  }

  flush(true);
  padToNextBarTicks();
  return { ticks: ticksOut, starts: startsSec, barIndex, tuplets, manualRests };
}
