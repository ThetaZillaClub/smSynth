// components/training/layout/stage/sheet/vexscore/drawSystem/selection.ts
import type { Tickable } from "vexflow";
import type { Selected, TickPack } from "./types";

export function selectInWindow(pack: TickPack, inWindow: (t0: number) => boolean): Selected {
  const outT: Tickable[] = [], outS: number[] = [], outI: number[] = [];
  for (let i = 0; i < pack.ticks.length; i++) {
    const t0 = pack.starts[i];
    if (inWindow(t0)) { outT.push(pack.ticks[i]); outS.push(t0); outI.push(i); }
  }
  return { t: outT, s: outS, i: outI };
}

type RestishLike = {
  isRest?: () => boolean;
  getDuration?: () => unknown;
  getCategory?: () => unknown;
};

export function isRestish(note: unknown): boolean {
  const n = note as RestishLike | null | undefined;
  if (typeof n?.isRest === "function" && n.isRest()) return true;

  const d = n?.getDuration?.();
  if (typeof d === "string" && d.endsWith("r")) return true;

  const cat = typeof n?.getCategory === "function" ? n.getCategory() : "";
  if (typeof cat === "string" && cat.toLowerCase().includes("ghost")) return true;

  return false;
}

export function dedupeSameStart(sel: Selected, dupEps: number): Selected {
  const { t: T, s: S, i: I } = sel;
  if (T.length <= 1) return sel;

  const outT: Tickable[] = [], outS: number[] = [], outI: number[] = [];
  for (let k = 0; k < T.length; k++) {
    const curT = T[k], curS = S[k], curI = I[k];
    if (!outS.length) { outT.push(curT); outS.push(curS); outI.push(curI); continue; }
    const j = outS.length - 1;
    if (Math.abs(curS - outS[j]) <= dupEps) {
      const keepIncoming = isRestish(outT[j]) && !isRestish(curT);
      if (keepIncoming) { outT[j] = curT; outS[j] = curS; outI[j] = curI; }
    } else {
      outT.push(curT); outS.push(curS); outI.push(curI);
    }
  }
  return { t: outT, s: outS, i: outI };
}

export function makeRelBarAt(args: {
  melSel: Selected;
  rhySel: Selected;
  barsPerRow: number;
  systemStartBar: number;
  barIndexOfTime: (t0: number) => number;
  mel: TickPack;
  rhy: TickPack;
}) {
  const { melSel, rhySel, barsPerRow, systemStartBar, barIndexOfTime, mel, rhy } = args;

  return (pack: TickPack, selIdx: number): number => {
    const sel = pack === mel ? melSel : (pack === rhy ? rhySel : melSel);
    const orig = sel.i[selIdx];
    const abs = pack.barIndex?.[orig];
    if (typeof abs === "number") {
      return Math.max(0, Math.min(barsPerRow - 1, abs - systemStartBar));
    }
    return barIndexOfTime(sel.s[selIdx]);
  };
}
