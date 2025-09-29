// hooks/gameplay/useScoringAlignment.ts
"use client";

import { useCallback } from "react";
import type { PitchSample } from "@/utils/scoring/score";

/**
 * Align raw capture streams to phrase-time (note 1 = t=0), compensating
 * for pipeline latency (pitch windowing / gesture pipeline) *before* scoring.
 *
 * ✔ Backward compatible with the previous API (pitchLagSec / gestureLagSec in seconds)
 * ✔ Safe if you accidentally pass milliseconds — auto-detects & converts
 * ✔ Optional hard clipping of extreme pre/post times to avoid 0% takes
 * ✔ Stable against missing/null inputs
 */
export type ScoringAlignmentOptions = {
  /**
   * How much negative time (pre-roll) to keep after alignment.
   * Use this to preserve a bit of grace right before t=0.
   * Default 0.5s. (Alias: clipBelowSec — kept for back-compat.)
   */
  keepPreRollSec?: number;
  /** @deprecated Use keepPreRollSec. */
  clipBelowSec?: number;

  /**
   * If provided, drop anything after this positive time (seconds) post-alignment.
   * Useful when you want to ensure no super-long tails are considered.
   * If both clipAboveSec and phraseLengthSec are set, the tighter bound is used.
   */
  clipAboveSec?: number | null;

  /**
   * Provide the exact musical window length (seconds) for the exercise content
   * (i.e., length of the RESPONSE window, not counting count-in).
   * When set, aligned streams are clipped to [ -keepPreRollSec, phraseLengthSec + tailGuardSec ].
   */
  phraseLengthSec?: number | null;

  /**
   * Extra tail guard when phraseLengthSec is provided (default 0.25s).
   * Gives a small cushion beyond the phrase end.
   */
  tailGuardSec?: number;

  /**
   * Latency compensation values.
   * You may use either the legacy `*Sec` fields (seconds),
   * or the unit-agnostic `pitchLag` / `gestureLag` plus `units`.
   *
   * Positive values mean "the measurement lags behind the notation",
   * therefore we shift it *earlier* by this amount during alignment.
   */
  // legacy (seconds)
  pitchLagSec?: number;
  gestureLagSec?: number;

  // new (seconds or milliseconds, controlled by `units`)
  pitchLag?: number;
  gestureLag?: number;
  units?: "s" | "ms";

  /**
   * Optional *extra* global offset (seconds) applied to both streams after lead-in.
   * Use sparingly; prefer the specific pitch/gesture lags above.
   */
  extraOffsetSec?: number;

  /**
   * When true, emit guardrail warnings for suspicious values (dev only).
   */
  devAssert?: boolean;
  consolePrefix?: string;
};

export default function useScoringAlignment() {
  return useCallback(
    (
      samplesRaw: PitchSample[] | null | undefined,
      beatsRaw: number[] | null | undefined,
      /**
       * Lead-in time (seconds) that the UI uses before the first notated note.
       * This is subtracted so that t=0 aligns with the first note onset.
       */
      leadInSec: number | null | undefined,
      opts: ScoringAlignmentOptions = {}
    ): { samples: PitchSample[]; beats: number[] } => {
      /* -------------------- normalize options -------------------- */
      const keepPreRollSec =
        numberOrNull(opts.keepPreRollSec) ??
        numberOrNull(opts.clipBelowSec) ??
        0.5;

      const clipAboveSec = numberOrNull(
        minDefined(
          numberOrNull(opts.clipAboveSec),
          clipCeilFromPhrase(opts.phraseLengthSec, opts.tailGuardSec)
        )
      );

      const tLead = numberOrNull(leadInSec) ?? 0;
      const extraOffsetSec = numberOrNull(opts.extraOffsetSec) ?? 0;

      // Lags: accept legacy "*Sec" (seconds) OR new "pitchLag/gestureLag" with units
      const lagPitchInput =
        numberOrNull(opts.pitchLagSec) ??
        numberOrNull(opts.pitchLag) ??
        0;

      const lagGestInput =
        numberOrNull(opts.gestureLagSec) ??
        numberOrNull(opts.gestureLag) ??
        0;

      const pitchLagSec = normalizeLagToSeconds(lagPitchInput, opts.units);
      const gestureLagSec = normalizeLagToSeconds(lagGestInput, opts.units);

      /* --------------------- safety guardrails -------------------- */
      if (opts.devAssert) {
        const warn = (msg: string) =>
          console.warn(`[${opts.consolePrefix ?? "align"}] ${msg}`);
        // If someone passes ~tens of "units", it's probably milliseconds.
        // We already auto-convert, but warn when it *looks* like ms arrived.
        if (Math.abs(lagPitchInput) > 3 && opts.units !== "ms" && !numberOrNull(opts.pitchLagSec)) {
          warn(
            `pitchLag looked like milliseconds (${lagPitchInput}). Autoconverted to seconds = ${pitchLagSec.toFixed(
              3
            )}. Consider setting units: "ms".`
          );
        }
        if (Math.abs(lagGestInput) > 3 && opts.units !== "ms" && !numberOrNull(opts.gestureLagSec)) {
          warn(
            `gestureLag looked like milliseconds (${lagGestInput}). Autoconverted to seconds = ${gestureLagSec.toFixed(
              3
            )}. Consider setting units: "ms".`
          );
        }
        if (Math.abs(pitchLagSec) > 2 || Math.abs(gestureLagSec) > 2) {
          warn(
            `Large lag after normalization (pitch=${pitchLagSec.toFixed(
              3
            )}s, gesture=${gestureLagSec.toFixed(
              3
            )}s). Is this intended?`
          );
        }
      }

      /* ------------------------- align --------------------------- */
      const shiftSamples = (t: number) => t - tLead - pitchLagSec - extraOffsetSec;
      const shiftBeats = (t: number) => t - tLead - gestureLagSec - extraOffsetSec;

      const S: PitchSample[] = Array.isArray(samplesRaw)
        ? samplesRaw.map((s) => ({
            ...s,
            tSec: shiftSamples(numberOrZero(s.tSec)),
          }))
        : [];

      const B: number[] = Array.isArray(beatsRaw)
        ? beatsRaw.map((t) => shiftBeats(numberOrZero(t)))
        : [];

      // Ensure monotonic ordering before clipping
      S.sort((a, b) => a.tSec - b.tSec);
      B.sort((a, b) => a - b);

      // Clip negative deep pre-roll and optional far tail
      const samples = S.filter(
        (s) =>
          s.tSec >= -keepPreRollSec &&
          (clipAboveSec == null || s.tSec <= clipAboveSec)
      );
      const beats = B.filter(
        (t) =>
          t >= -keepPreRollSec &&
          (clipAboveSec == null || t <= clipAboveSec)
      );

      return { samples, beats };
    },
    []
  );
}

/* ----------------------- small helpers ------------------------ */

function numberOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}
function numberOrZero(v: unknown): number {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function normalizeLagToSeconds(val: number, units?: "s" | "ms"): number {
  if (!Number.isFinite(val)) return 0;
  if (units === "ms") return val / 1000;
  if (units === "s") return val;
  // Autodetect: values > ~3 are almost certainly milliseconds for this app.
  return Math.abs(val) > 3 ? val / 1000 : val;
}

function clipCeilFromPhrase(
  phraseLengthSec?: number | null,
  tailGuardSec?: number | null
): number | null {
  const L = numberOrNull(phraseLengthSec);
  if (L == null) return null;
  const guard = numberOrNull(tailGuardSec) ?? 0.25;
  return Math.max(0, L + guard);
}

function minDefined(...vals: Array<number | null>): number | null {
  const xs = vals.filter((v): v is number => v != null && Number.isFinite(v));
  return xs.length ? Math.min(...xs) : null;
}
