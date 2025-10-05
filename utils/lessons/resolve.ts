// utils/lessons/resolve.ts
import { DEFAULT_SESSION_CONFIG, type SessionConfig } from "@/components/training/session";
import { hzToMidi } from "@/utils/pitch/pitchMath";

export type StudentRange = { lowHz: number | null; highHz: number | null };

function windowsForKeyInRange(tonicPc: number, lowHz: number, highHz: number): number[] {
  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
  const out: number[] = [];
  for (let m = loM; m <= hiM - 12; m++) {
    if ((((m % 12) + 12) % 12) === (((tonicPc % 12) + 12) % 12)) out.push(m);
  }
  return out;
}

function allowedTonicPcs(lowHz: number, highHz: number): Set<number> {
  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
  const set = new Set<number>();
  for (let m = loM; m <= hiM - 12; m++) set.add(((m % 12) + 12) % 12);
  return set;
}

function pickBestWindow(windows: number[], lowHz: number, highHz: number, preferredIndex: number | null): number | null {
  if (!windows.length) return null;
  if (preferredIndex != null) {
    const idx = Math.max(0, Math.min(windows.length - 1, preferredIndex));
    return windows[idx]!;
  }
  // Otherwise pick the window whose tonic is nearest the center of usable range.
  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz) - 12)); // ensure full octave above tonic
  const center = Math.round((loM + hiM) / 2);
  return windows
    .slice()
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center))[0]!;
}

/**
 * Resolve a lesson preset into a concrete SessionConfig (no UI).
 *
 * - Merges defaults
 * - Resolves random key into a concrete tonic + tonicMidis if student range is available
 * - Optionally auto-picks a tonic window when missing
 */
export function resolveLessonToSession(
  lessonPreset: Partial<SessionConfig>,
  range: StudentRange,
  opts?: {
    autoSelectWindowIfMissing?: boolean;   // default true
    clampKeyToRange?: boolean;             // default true (ignored if no range)
  }
): SessionConfig {
  const { lowHz, highHz } = range;
  const autoWindow = opts?.autoSelectWindowIfMissing !== false;
  const clampKey = opts?.clampKeyToRange !== false;

  // Merge with defaults
  const merged: SessionConfig = { ...DEFAULT_SESSION_CONFIG, ...lessonPreset };

  // Keep rhythm UI extras (lineEnabled, detectEnabled) if author included them
  if (lessonPreset.rhythm) {
    merged.rhythm = { ...(DEFAULT_SESSION_CONFIG.rhythm as any), ...(lessonPreset.rhythm as any) } as any;
  }

  const haveRange = typeof lowHz === "number" && typeof highHz === "number";

  // --- Random key resolution
  if (haveRange && merged.scale?.randomTonic) {
    const pcs = Array.from(allowedTonicPcs(lowHz!, highHz!));
    // Prefer existing tonic if it is allowed; otherwise pick any allowed
    const desiredPc = merged.scale.tonicPc ?? 0;
    const chosenPc = pcs.includes(((desiredPc % 12) + 12) % 12)
      ? ((desiredPc % 12) + 12) % 12
      : (pcs[0] ?? desiredPc);

    const windows = windowsForKeyInRange(chosenPc, lowHz!, highHz!);

    // Use first preferredOctaveIndices item when present
    const rawPref =
      Array.isArray(merged.preferredOctaveIndices) && merged.preferredOctaveIndices.length
        ? merged.preferredOctaveIndices[0]!
        : 1; // legacy default “Octave 2”
    const chosenWindow = pickBestWindow(windows, lowHz!, highHz!, Number.isFinite(rawPref) ? Math.floor(rawPref) : null);

    merged.scale = { ...(merged.scale ?? {}), tonicPc: chosenPc, randomTonic: false };
    merged.tonicMidis = chosenWindow != null ? [chosenWindow] : null;
    return merged;
  }

  // --- Clamp fixed key to range (optional)
  if (haveRange && clampKey && merged.scale && typeof merged.scale.tonicPc === "number") {
    const pcs = allowedTonicPcs(lowHz!, highHz!);
    const pc = ((merged.scale.tonicPc % 12) + 12) % 12;
    if (!pcs.has(pc)) {
      // If the fixed key can't produce any full window, we leave it as-is (game will still clamp note pool to range),
      // but we can try to nudge tonicPc to a nearby allowed pc to guarantee full-octave phrases:
      const replacement = pcs.size ? Array.from(pcs)[0]! : pc;
      merged.scale = { ...(merged.scale ?? {}), tonicPc: replacement };
    }
  }

  // --- Auto-select a tonic window if none provided
  if (haveRange && autoWindow && (!merged.tonicMidis || merged.tonicMidis.length === 0) && merged.scale) {
    const windows = windowsForKeyInRange(merged.scale.tonicPc, lowHz!, highHz!);
    if (windows.length) {
      const pref =
        Array.isArray(merged.preferredOctaveIndices) && merged.preferredOctaveIndices.length
          ? Math.floor(merged.preferredOctaveIndices[0]!)
          : null;
      const chosen = pickBestWindow(windows, lowHz!, highHz!, pref);
      merged.tonicMidis = chosen != null ? [chosen] : null;
    }
  }

  return merged;
}
