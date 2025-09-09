// utils/training/text.ts
import { hzToNoteName } from "@/utils/pitch/pitchMath";

export function formatMicText(error?: string | null, isReady?: boolean) {
  return error ? `Mic error: ${String(error)}` : isReady ? "Mic ready" : "Starting mic…";
}

export function formatPitchText(pitch: number | null | undefined) {
  return typeof pitch === "number" ? `${pitch.toFixed(1)} Hz` : "—";
}

export function formatNoteText(pitch: number | null | undefined) {
  if (typeof pitch !== "number") return "—";
  const { name, octave, cents } = hzToNoteName(pitch, 440, { useSharps: true, octaveAnchor: "A" });
  const sign = cents > 0 ? "+" : "";
  return `${name}${octave} ${sign}${cents}¢`;
}
