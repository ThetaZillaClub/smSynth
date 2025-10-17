"use client";

import React from "react";
import Readout from "./Readout";
import type { ScaleName } from "@/utils/phrase/scales";

// Local friendly label map to remove legacy meta/ files
const SCALE_LABEL: Record<ScaleName, string> = {
  major: "Major",
  natural_minor: "Aeolian",
  harmonic_minor: "Harmonic Minor",
  melodic_minor: "Melodic Minor",
  dorian: "Dorian",
  phrygian: "Phrygian",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  locrian: "Locrian",
  major_pentatonic: "Major Pentatonic",
  minor_pentatonic: "Minor Pentatonic",
  chromatic: "Chromatic",
};

function friendlyScaleLabel(scaleName: ScaleName | null | undefined, keySig: string | null | undefined): string {
  if (scaleName && SCALE_LABEL[scaleName]) return SCALE_LABEL[scaleName];
  if (keySig) {
    const tail = keySig.toLowerCase();
    if (/\bharmonic\s*minor\b/.test(tail)) return "Harmonic Minor";
    if (/\bmelodic\s*minor\b/.test(tail)) return "Melodic Minor";
    if (/\bminor\b|\baeolian\b/.test(tail)) return "Aeolian";
    if (/\bdorian\b/.test(tail)) return "Dorian";
    if (/\bphrygian\b/.test(tail)) return "Phrygian";
    if (/\blydian\b/.test(tail)) return "Lydian";
    if (/\bmixolydian\b/.test(tail)) return "Mixolydian";
    if (/\blocrian\b/.test(tail)) return "Locrian";
    if (/\bmajor\b|\bionian\b/.test(tail)) return "Major";
    if (/\bchromatic\b/.test(tail)) return "Chromatic";
    if (/\bmajor\s*penta|\bpentatonic\s*major\b/.test(tail)) return "Major Pentatonic";
    if (/\bminor\s*penta|\bpentatonic\s*minor\b/.test(tail)) return "Minor Pentatonic";
  }
  return "—";
}

export default function ScaleReadout({
  scaleName,
  keySig,
  className,
}: {
  scaleName: ScaleName | null;
  keySig: string | null;
  className?: string;
}) {
  const value = friendlyScaleLabel(scaleName, keySig);
  return <Readout className={className} label="Scale" value={value} />;
}
