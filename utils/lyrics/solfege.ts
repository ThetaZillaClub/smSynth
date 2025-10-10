// utils/lyrics/solfege.ts
// ---------------------------------
// Solfege lyric generation (movable-do, tonic- and mode-aware)
// Supports chromatic (raised/lowered), diatonic modes, natural/harmonic/melodic minor,
// and major/minor pentatonic. Returns syllables based on pitch class relative to tonic.

export type ChromaticStyle = "auto" | "raised" | "lowered";
export type CaseStyle = "lower" | "capital";

// Chromatic solfege syllables relative to tonic (0..11), do-based
const CHROMATIC_RAISED = [
  "do", "di", "re", "ri", "mi", "fa", "fi", "sol", "si", "la", "li", "ti",
] as const;
const CHROMATIC_LOWERED = [
  "do", "ra", "re", "me", "mi", "fa", "se", "sol", "le", "la", "te", "ti",
] as const;

// Diatonic degree names for movable-do (Ionian) and mode rotations
const IONIAN  = ["do","re","mi","fa","sol","la","ti"] as const;
const AEOLIAN = ["la","ti","do","re","mi","fa","sol"] as const; // natural minor
const DORIAN  = ["re","mi","fa","sol","la","ti","do"] as const;
const PHRYGIAN= ["mi","fa","sol","la","ti","do","re"] as const;
const LYDIAN  = ["fa","sol","la","ti","do","re","mi"] as const;
const MIXO    = ["sol","la","ti","do","re","mi","fa"] as const;
const LOCRIAN = ["ti","do","re","mi","fa","sol","la"] as const;

// Pentatonic (subset of diatonic): map only the degrees present (relative semitone -> syllable)
const MAJOR_PENTA: Record<number,string> = { 0:"do", 2:"re", 4:"mi", 7:"sol", 9:"la" };
const MINOR_PENTA: Record<number,string> = { 0:"la", 3:"do", 5:"re", 7:"mi", 10:"sol" }; // la-based

export type SolfegeScaleName =
  | "major"
  | "natural_minor"
  | "harmonic_minor"
  | "melodic_minor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "locrian"
  | "major_pentatonic"
  | "minor_pentatonic"
  | "chromatic";

// Helper: prefer sharps vs flats for chromatic naming based on tonic (simple key signature heuristic)
const PREFER_SHARPS = new Set([0, 7, 2, 9, 4, 11, 6, 1]); // C G D A E B F# C#
function pickChromatic(style: ChromaticStyle, tonicPc: number) {
  if (style === "raised") return CHROMATIC_RAISED;
  if (style === "lowered") return CHROMATIC_LOWERED;
  return PREFER_SHARPS.has(((tonicPc % 12) + 12) % 12) ? CHROMATIC_RAISED : CHROMATIC_LOWERED;
}

function titleCase(s: string, caseStyle: CaseStyle) {
  if (caseStyle === "capital") return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

// Return diatonic degree names array for a given mode name
function degreeNamesForMode(name: SolfegeScaleName): ReadonlyArray<string> | null {
  switch (name) {
    case "major":          return IONIAN;
    case "natural_minor":  return AEOLIAN;
    case "dorian":         return DORIAN;
    case "phrygian":       return PHRYGIAN;
    case "lydian":         return LYDIAN;
    case "mixolydian":     return MIXO;
    case "locrian":        return LOCRIAN;
    default:               return null; // chromatic & pentatonics handled elsewhere; harmonic/melodic minor are custom
  }
}

// Semitone sets for each scale (relative to tonic)
const SCALE_STEPS: Record<SolfegeScaleName, number[]> = {
  major:            [0,2,4,5,7,9,11],
  natural_minor:    [0,2,3,5,7,8,10],
  harmonic_minor:   [0,2,3,5,7,8,11], // raised 7
  melodic_minor:    [0,2,3,5,7,9,11], // ascending form (raised 6 & 7)
  dorian:           [0,2,3,5,7,9,10],
  phrygian:         [0,1,3,5,7,8,10],
  lydian:           [0,2,4,6,7,9,11],
  mixolydian:       [0,2,4,5,7,9,10],
  locrian:          [0,1,3,5,6,8,10],
  major_pentatonic: [0,2,4,7,9],
  minor_pentatonic: [0,3,5,7,10],
  chromatic:        [0,1,2,3,4,5,6,7,8,9,10,11],
};

// NEW: map each scale to its tonic solfege syllable (for chromatic rotation)
const MODE_TONIC_SYLLABLE: Record<SolfegeScaleName, string> = {
  major: "do",
  natural_minor: "la",
  harmonic_minor: "la",     // treat as Aeolian base with raised 7
  melodic_minor: "la",      // ascending form: Aeolian base with raised 6 & 7
  dorian: "re",
  phrygian: "mi",
  lydian: "fa",
  mixolydian: "sol",
  locrian: "ti",
  major_pentatonic: "do",
  minor_pentatonic: "la",
  chromatic: "do",          // leave plain do-based when explicitly chromatic
};

// Rotate a chromatic array so index 0 is the mode's tonic syllable (e.g., "la" for Aeolian)
function rotateChromaticForMode(
  baseChromatic: readonly string[],
  name: SolfegeScaleName
): readonly string[] {
  // Only rotate when we have a modal tonic (not the explicit "chromatic" case)
  if (name === "chromatic") return baseChromatic;
  const tonicSyll = MODE_TONIC_SYLLABLE[name] ?? "do";
  const idx = baseChromatic.indexOf(tonicSyll);
  if (idx <= 0) return baseChromatic;
  // rotate left by idx
  return [...baseChromatic.slice(idx), ...baseChromatic.slice(0, idx)];
}

// Map a single pitch-class (0..11) → solfege syllable
export function pcToSolfege(
  pcAbs: number,
  tonicPc: number,
  name: SolfegeScaleName,
  opts: { chromaticStyle?: ChromaticStyle; caseStyle?: CaseStyle } = {}
): string {
  const baseChromatic = pickChromatic(opts.chromaticStyle ?? "auto", tonicPc);
  const chroma = rotateChromaticForMode(baseChromatic, name);
  const rel = ((pcAbs - tonicPc) % 12 + 12) % 12;

  if (name === "chromatic") {
    // explicit chromatic mode stays do-based (no rotation)
    return titleCase(baseChromatic[rel], opts.caseStyle ?? "lower");
  }

  const steps = SCALE_STEPS[name];

  // Pentatonics: direct lookups (fallback to rotated chromatic for out-of-scale pcs)
  if (name === "major_pentatonic") {
    const syll = MAJOR_PENTA[rel as keyof typeof MAJOR_PENTA];
    return titleCase(syll ?? chroma[rel], opts.caseStyle ?? "lower");
  }
  if (name === "minor_pentatonic") {
    const syll = MINOR_PENTA[rel as keyof typeof MINOR_PENTA];
    return titleCase(syll ?? chroma[rel], opts.caseStyle ?? "lower");
  }

  // Diatonic modes
  const degrees = degreeNamesForMode(name);
  if (degrees) {
    const idx = steps.indexOf(rel);
    if (idx >= 0) return titleCase(degrees[idx], opts.caseStyle ?? "lower");
    // Out-of-scale → chromatic alteration syllable (ROTATED to mode tonic)
    return titleCase(chroma[rel], opts.caseStyle ?? "lower");
  }

  // Harmonic/Melodic minor: Aeolian base with alterations, and rotated chromatic fallback
  if (name === "harmonic_minor") {
    // aeolian + raised 7 → "si"
    if (rel === 11) return titleCase("si", opts.caseStyle ?? "lower");
    const idx = SCALE_STEPS.natural_minor.indexOf(rel);
    if (idx >= 0) return titleCase(AEOLIAN[idx], opts.caseStyle ?? "lower");
    return titleCase(chroma[rel], opts.caseStyle ?? "lower");
  }
  if (name === "melodic_minor") {
    // ascending melodic: aeolian + raised 6 (fi) + raised 7 (si)
    if (rel === 9)  return titleCase("fi", opts.caseStyle ?? "lower"); // 6↑
    if (rel === 11) return titleCase("si", opts.caseStyle ?? "lower"); // 7↑
    const idx = SCALE_STEPS.natural_minor.indexOf(rel);
    if (idx >= 0) return titleCase(AEOLIAN[idx], opts.caseStyle ?? "lower");
    return titleCase(chroma[rel], opts.caseStyle ?? "lower");
  }

  // Fallback (shouldn’t hit)
  return titleCase(chroma[rel], opts.caseStyle ?? "lower");
}

// Generate lyrics (one syllable per note) for a Phrase
export function makeSolfegeLyrics(
  phrase: { notes: { midi: number }[] },
  tonicPc: number,
  name: SolfegeScaleName,
  opts: { chromaticStyle?: ChromaticStyle; caseStyle?: CaseStyle } = {}
): string[] {
  const caseStyle = opts.caseStyle ?? "lower";
  return (phrase?.notes ?? []).map((n) => {
    const pcAbs = ((Math.round(n.midi) % 12) + 12) % 12;
    return pcToSolfege(pcAbs, tonicPc, name, { chromaticStyle: opts.chromaticStyle, caseStyle });
  });
}
