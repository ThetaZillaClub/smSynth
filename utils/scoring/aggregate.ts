// utils/scoring/aggregate.ts
import type { TakeScore } from "@/utils/scoring/score";
import { letterFromPercent } from "@/utils/scoring/grade";
import { finalizeVisible } from "./final/finalize";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
const r5 = (x: number) => Math.round(x * 100000) / 100000; // for ratio(6,5)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function shortIntervalLabel(semitones: number): string {
  switch (semitones) {
    case 0: return "P1"; case 1: return "m2"; case 2: return "M2"; case 3: return "m3";
    case 4: return "M3"; case 5: return "P4"; case 6: return "TT"; case 7: return "P5";
    case 8: return "m6"; case 9: return "M6"; case 10: return "m7"; case 11: return "M7";
    case 12: return "P8"; default: return String(semitones);
  }
}

export function aggregateForSubmission(
  scores: TakeScore[],
  visibility?: { showMelodyRhythm?: boolean; showRhythmLine?: boolean; showIntervals?: boolean },
  opts?: {
    /** Map a duration (seconds) to a label ("Quarter", "Eighth", ...). */
    melodyLabelFromSeconds?: (sec: number, noteIdx?: number, takeIdx?: number) => string | undefined;
    /** Label a hand-line event by index/expected time. Return undefined to SKIP non-beat events. */
    lineLabelByEvent?: (takeIdx: number, ev: { idx: number; expSec: number }) => string | undefined;
    /** If melody coverage ignored head, add back the grace (e.g., 0.12). */
    onsetGraceSec?: number;
  }
): TakeScore {
  // Finals reflect what the user saw (visibility-aware per-take)
  const finalPct = mean(scores.map((s) => finalizeVisible(s, visibility).percent));

  const pitchPct = mean(scores.map((s) => s.pitch.percent));
  const pitchOn = clamp01(mean(scores.map((s) => s.pitch.timeOnPitchRatio)));
  const pitchMae = mean(scores.map((s) => s.pitch.centsMae));
  const melPct  = mean(scores.map((s) => s.rhythm.melodyPercent)); // UI will gate display

  // ---- aggregate pitch per-MIDI for DB child table ----
  type Acc = { n: number; ratio: number; mae: number };
  const byMidi = new Map<number, Acc>();
  for (const s of scores) {
    for (const p of s.pitch.perNote ?? []) {
      const midi = Math.round((p as any).midi ?? NaN);
      if (!Number.isFinite(midi)) continue;
      const g = byMidi.get(midi) ?? { n: 0, ratio: 0, mae: 0 };
      g.n += 1;
      g.ratio += ((p as any).ratio - g.ratio) / g.n;
      g.mae   += ((p as any).centsMae - g.mae) / g.n;
      byMidi.set(midi, g);
    }
  }
  const pitchPerMidi = Array.from(byMidi.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([midi, g]) => ({
      idx: 0,
      midi,
      timeOnPitch: 0,
      dur: 0,
      n: g.n,
      ratio: r5(g.ratio),
      centsMae: r2(g.mae),
    }));

  // ---- rhythm (existing; keep separate in payload; compute a simple visibility-aware combined for analytics only) ----
  let melodyAttemptsTotal = 0;
  let melodyHitsTotal = 0;
  const melodyAbsErrs: number[] = [];
  const lineHits: number[] = [];
  const lineAbsErrs: number[] = [];
  let lineEventCount = 0;
  let lineCreditSum = 0;
  let anyLine = false;

  // New totals for aggregated hit-rate
  let lineAttemptsTotal = 0;
  let lineSuccessesTotal = 0;

  for (const s of scores) {
    (s.rhythm.perNoteMelody ?? []).forEach(r => {
      melodyAttemptsTotal += 1;
      if ((r.coverage ?? 0) > 0) melodyHitsTotal += 1; // hit = any voicing in window
      if (Number.isFinite(r.onsetErrMs)) melodyAbsErrs.push(Math.abs(r.onsetErrMs!));
    });
    if (s.rhythm.lineEvaluated) {
      anyLine = true;
      (s.rhythm.linePerEvent ?? []).forEach(e => {
        const hit = (e.credit ?? 0) > 0;
        lineAttemptsTotal += 1;
        if (hit) lineSuccessesTotal += 1;
        lineHits.push(hit ? 1 : 0);
        if (Number.isFinite(e.errMs)) lineAbsErrs.push(Math.abs(e.errMs!));
        lineEventCount += 1;
        lineCreditSum  += Math.max(0, e.credit ?? 0);        
      });
    }
  }

  const melodyHitRate   =
    melodyAttemptsTotal ? clamp01(melodyHitsTotal / melodyAttemptsTotal) : clamp01(melPct / 100);
  const melodyMeanAbsMs = melodyAbsErrs.length ? Math.round(mean(melodyAbsErrs)) : 0;

  const showLine     = visibility?.showRhythmLine !== false;
  const linePercent  =
    showLine && anyLine
      ? r2(lineEventCount ? (lineCreditSum / lineEventCount) * 100 : 0)
      : 0;

  const lineHitRate     = lineAttemptsTotal ? clamp01(lineSuccessesTotal / lineAttemptsTotal)
                                            : clamp01(lineHits.length ? mean(lineHits) : 0);
  const lineMeanAbsMs   = lineAbsErrs.length ? Math.round(mean(lineAbsErrs)) : 0;

  // ---- NEW: roll up rows for DB child tables (labels supplied by caller) ----
  type MelAcc = { n: number; hits: number; absSum: number };
  type LineAcc = { n: number; hits: number; absSum: number };
  const onsetGraceSec = Math.max(0, opts?.onsetGraceSec ?? 0);

  const melMap = new Map<string, MelAcc>();
  scores.forEach((s, takeIdx) => {
    (s.rhythm.perNoteMelody ?? []).forEach((r, noteIdx) => {
      const durSecForLabel = (r.dur ?? 0) + onsetGraceSec; // reverse the ignored head for labeling, if desired
      const label = opts?.melodyLabelFromSeconds
        ? (opts.melodyLabelFromSeconds(durSecForLabel, noteIdx, takeIdx) ?? "All")
        : "All";
      const g = melMap.get(label) ?? { n: 0, hits: 0, absSum: 0 };

      g.n += 1;
      if ((r.coverage ?? 0) > 0) g.hits += 1;
      if (Number.isFinite(r.onsetErrMs)) g.absSum += Math.abs(r.onsetErrMs!);
      melMap.set(label, g);
    });
  });
  const melodyByDuration = Array.from(melMap.entries()).map(([durationLabel, g]) => ({
    durationLabel,
    attempts: g.n,
    hits: g.hits,
    hitPct: Math.round((g.hits / Math.max(1, g.n)) * 100),
    firstVoiceMuAbsMs: Math.round(g.absSum / Math.max(1, g.n)),
  }));

  const lineMap = new Map<string, LineAcc>();
  scores.forEach((s, takeIdx) => {
    if (!s.rhythm.lineEvaluated) return;
    (s.rhythm.linePerEvent ?? []).forEach((e) => {
      // If a labeler is provided and returns undefined → SKIP (non-beat).
      let label: string | undefined;
      if (opts?.lineLabelByEvent) {
        label = opts.lineLabelByEvent(takeIdx, { idx: e.idx, expSec: e.expSec });
        if (!label) return; // do not include in rollup
      } else {
        label = "All";
      }
      const g = lineMap.get(label) ?? { n: 0, hits: 0, absSum: 0 };
      g.n += 1;
      g.hits += (e.credit ?? 0) > 0 ? 1 : 0;
      if (Number.isFinite(e.errMs)) g.absSum += Math.abs(e.errMs!);
      lineMap.set(label, g);
    });
  });
  const lineByDuration = Array.from(lineMap.entries()).map(([durationLabel, g]) => ({
    durationLabel,
    attempts: g.n,
    successes: g.hits,
    hitPct: Math.round((g.hits / Math.max(1, g.n)) * 100),
    muAbsMs: Math.round(g.absSum / Math.max(1, g.n)),
  }));

  // Visibility-aware "combined" rhythm percent for analytics (not used for finalization).
  const useMelody = visibility?.showMelodyRhythm !== false;
  const useLine   = visibility?.showRhythmLine   !== false;
  const combinedPercent = r2(mean(scores.map(s => {
    const parts: number[] = [];
    if (useMelody) parts.push(s.rhythm.melodyPercent);
    if (useLine && s.rhythm.lineEvaluated) parts.push(s.rhythm.linePercent);
    return parts.length ? parts.reduce((a,b)=>a+b,0) / parts.length : 0;
  })));

  // ---- intervals (existing; zero out if hidden) ----
  const byClass = new Map<number, { attempts: number; correct: number }>();
  for (let i = 0; i <= 12; i++) byClass.set(i, { attempts: 0, correct: 0 });

  scores.forEach(s => (s.intervals.classes ?? []).forEach(c => {
    const cell = byClass.get(c.semitones)!;
    cell.attempts += c.attempts || 0;
    cell.correct  += c.correct  || 0;
  }));

  const intervalsClasses =
    Array.from(byClass.entries())
      .filter(([, v]) => v.attempts > 0)
      .map(([semitones, v]) => ({
        semitones, attempts: v.attempts, correct: v.correct,
        label: shortIntervalLabel(semitones),
        percent: v.attempts ? r2((v.correct / v.attempts) * 100) : 0,
      }));

  const total   = intervalsClasses.reduce((a, c) => a + c.attempts, 0);
  const correct = intervalsClasses.reduce((a, c) => a + c.correct, 0);
  const ratio   = total ? clamp01(correct / total) : 0;

  const intervalsPayload = (visibility?.showIntervals === false)
    ? { total: 0, correct: 0, correctRatio: 0, classes: [] as typeof intervalsClasses }
    : { total, correct, correctRatio: r2(ratio), classes: intervalsClasses };

  return {
    final: { percent: r2(finalPct), letter: letterFromPercent(finalPct) },
    pitch: {
      percent: r2(pitchPct),
      timeOnPitchRatio: r2(pitchOn),
      centsMae: r2(pitchMae),
      perNote: pitchPerMidi as any, // shape-compatible for route consumption
    },
    rhythm: {
      melodyPercent: r2(melPct),
      melodyHitRate,
      melodyMeanAbsMs,
      lineEvaluated: anyLine,
      linePercent,
      lineHitRate,
      lineMeanAbsMs,
      combinedPercent,
      // keep heavy arrays empty in the aggregate payload
      perNoteMelody: [],
      linePerEvent: [],
      // new rollups for DB
      melodyByDuration,
      lineByDuration,
      lineAttempts: lineAttemptsTotal,
      lineSuccesses: lineSuccessesTotal,
    },
    intervals: intervalsPayload,
  };
}
