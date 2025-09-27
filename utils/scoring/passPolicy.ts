// utils/scoring/passPolicy.ts
import type { TakeScore } from "./score";

/**
 * Softer, human-feeling gate.
 * Idea: if you're mostly on pitch, you pass — even with small timing wobbles.
 */
export type PassPolicy = {
  /** Floor for the overall score (balanced pitch×rhythm). */
  minFinalPct: number;          // ex: 60
  /** Safety floor for pitch alone. Helps “I hit the notes but rhythm is meh.” */
  minPitchPct: number;          // ex: 65
  /** Consider long held notes: time actually on target pitch (normalized 0–1). */
  minTimeOnPitchRatio: number;  // ex: 0.55
  /** Mean absolute pitch error ceiling (in cents) — be generous. */
  maxCentsMae: number;          // ex: 60
};

export const DEFAULT_PASS_POLICY: PassPolicy = {
  minFinalPct: 60,
  minPitchPct: 65,
  minTimeOnPitchRatio: 0.55,
  maxCentsMae: 60,
};

export function computePass(
  score: TakeScore | undefined,
  policy: PassPolicy = DEFAULT_PASS_POLICY
): { passed: boolean; reasons: string[] } {
  if (!score) return { passed: false, reasons: ["no score"] };

  const reasons: string[] = [];
  const pitchPct = score.pitch.percent;
  const finalPct = score.final.percent;
  const tOn = score.pitch.timeOnPitchRatio;      // 0..1
  const mae = score.pitch.centsMae;              // cents

  const guards = [
    finalPct >= policy.minFinalPct,
    pitchPct >= policy.minPitchPct,
    tOn >= policy.minTimeOnPitchRatio,
    mae <= policy.maxCentsMae,
  ];

  if (guards.filter(Boolean).length >= 2) return { passed: true, reasons };

  if (finalPct < policy.minFinalPct) reasons.push(`final ${finalPct.toFixed(1)}% < ${policy.minFinalPct}%`);
  if (pitchPct < policy.minPitchPct) reasons.push(`pitch ${pitchPct.toFixed(1)}% < ${policy.minPitchPct}%`);
  if (tOn < policy.minTimeOnPitchRatio) reasons.push(`time-on-pitch ${(tOn * 100).toFixed(0)}% < ${(policy.minTimeOnPitchRatio*100).toFixed(0)}%`);
  if (mae > policy.maxCentsMae) reasons.push(`MAE ${Math.round(mae)}¢ > ${policy.maxCentsMae}¢`);

  return { passed: false, reasons };
}
