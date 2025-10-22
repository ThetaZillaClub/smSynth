// components/training/layout/stage/polar-tune/TuneView.tsx
'use client';
import * as React from 'react';
import PolarTuneView from "./PolarTuneView";
import PolarPitchTune from "./PolarPitchTune";
import CentsIndicator from "./CentsIndicator";
import { hzToMidi, relPcFloat } from "./polar-helpers";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";
import { pcToSolfege } from "@/utils/lyrics/solfege";
import { pcLabelForKey } from "@/utils/pitch/enharmonics";
import type { ScaleName } from "@/utils/phrase/scales";

type MiniPhrase = { notes?: { midi: number }[] } | null | undefined;

function deriveActiveRelsFromPhrase(
  phrase: MiniPhrase,
  tonicPc: number
): number[] {
  const set = new Set<number>();
  const tpc = ((tonicPc % 12) + 12) % 12;
  const notes = phrase?.notes ?? [];
  for (const n of notes) {
    const pc = ((Math.round(n.midi) % 12) + 12) % 12;
    set.add(((pc - tpc) + 12) % 12);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/** nearest-int MIDI helper (undefined-safe), choose first note with matching rel */
function firstTargetMidi(
  phrase: MiniPhrase,
  tonicPc: number,
  targetRel: number | undefined
) {
  const notes = phrase?.notes ?? [];
  if (!notes.length) return undefined;
  const tpc = ((tonicPc % 12) + 12) % 12;
  if (typeof targetRel === "number") {
    for (const n of notes) {
      const m = Math.round(n.midi);
      const pc = ((m % 12) + 12) % 12;
      const rel = ((pc - tpc) + 12) % 12;
      if (rel === targetRel) return m;
    }
  }
  return Math.round(notes[0].midi);
}

/** Key-aware scientific name (Bb vs A# etc.) */
function midiToKeyAwareName(
  midi: number,
  tonicPc: number,
  scaleName: ScaleName | string
): string {
  const m = Math.round(midi);
  const pcAbs = ((m % 12) + 12) % 12;
  const letter = pcLabelForKey(pcAbs, tonicPc, scaleName as unknown as ScaleName);
  const octave = Math.floor(m / 12) - 1;
  return `${letter}${octave}`;
}

export default function TuneView({
  phrase,
  liveHz,
  confidence,
  confThreshold = 0.5,
  tonicPc,
  scaleName,
  title,
  centerProgress01,
  /** when provided, this rel (0..11) becomes the current target */
  targetRelOverride,
  /** NEW: when provided, use this exact MIDI for the center secondary label (A2/A3) */
  targetMidiOverride,
}: {
  phrase?: MiniPhrase;
  liveHz: number | null;
  confidence: number;
  confThreshold?: number;
  tonicPc: number;
  scaleName: SolfegeScaleName;
  title?: string;
  centerProgress01?: number;
  targetRelOverride?: number;
  targetMidiOverride?: number;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(0);
  const [h, setH] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || Math.round(el.getBoundingClientRect().width);
      const h = el.clientHeight || Math.round(el.getBoundingClientRect().height);
      const size = Math.max(
        240,
        Math.min(Math.floor(w * 0.95), Math.floor(h * 0.66))
      );
      setW(size);
      setH(size);
    };
    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Active rels (unique) for ring labels
  const activeRelsBase = React.useMemo(
    () => deriveActiveRelsFromPhrase(phrase, tonicPc),
    [phrase, tonicPc]
  );

  // Current target rel to use (override > first rel > 0)
  const targetRel = React.useMemo<number>(() => {
    const fallback = activeRelsBase[0] ?? 0;
    const n = typeof targetRelOverride === "number" ? targetRelOverride : fallback;
    return ((n % 12) + 12) % 12;
  }, [activeRelsBase, targetRelOverride]);

  // Put the current target first so PolarTuneView greens the right wedge
  const activeRelsOrdered = React.useMemo(() => {
    const rest = activeRelsBase.filter((r) => r !== targetRel);
    return [targetRel, ...rest];
  }, [activeRelsBase, targetRel]);

  // Prefer exact override MIDI if provided; otherwise fall back to first matching note
  const targetMidi = React.useMemo(
    () =>
      typeof targetMidiOverride === "number"
        ? targetMidiOverride
        : firstTargetMidi(phrase, tonicPc, targetRel),
    [targetMidiOverride, phrase, tonicPc, targetRel]
  );

  // Center labels
  const centerPrimary = React.useMemo(() => {
    const absPc = (((tonicPc + targetRel) % 12) + 12) % 12;
    return pcToSolfege(absPc, tonicPc, scaleName, {
      chromaticStyle: 'auto',
      caseStyle: 'capital',
    });
  }, [tonicPc, targetRel, scaleName]);

  const centerSecondary = React.useMemo(() => {
    return typeof targetMidi === "number" ? midiToKeyAwareName(targetMidi, tonicPc, scaleName) : "";
  }, [targetMidi, tonicPc, scaleName]);

  // Live transforms shared by both subcomponents
  const liveRel =
    (typeof liveHz === "number" && liveHz > 0)
      ? relPcFloat(hzToMidi(liveHz, 440), tonicPc)
      : undefined;

  let liveCents: number | undefined = undefined;
  if (liveRel !== undefined) {
    let dRel = liveRel - targetRel;
    if (dRel > 6) dRel -= 12;
    if (dRel < -6) dRel += 12;
    liveCents = dRel * 100;
  }

  return (
    <div ref={hostRef} className="w-full h-full flex flex-col items-center justify-center">
      <div style={{ position: "relative", width: w, height: h }}>
        <div
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
          aria-hidden
        >
          <PolarPitchTune
            width={w}
            height={h}
            liveHz={liveHz}
            confidence={confidence}
            confThreshold={confThreshold}
            tonicPc={tonicPc}
            targetRel={targetRel}   // ← current expected note
          />
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <PolarTuneView
            tonicPc={tonicPc}
            scaleName={scaleName}
            activeRels={activeRelsOrdered}  // ← target first for wedge highlight
            title={title}
            liveRel={liveRel}
            liveCents={liveCents}
            confidence={confidence}
            confThreshold={confThreshold}
            centerPrimary={centerPrimary}
            centerSecondary={centerSecondary}
            centerProgress01={centerProgress01}
          />
        </div>
      </div>

      <CentsIndicator
        liveRel={liveRel}
        liveCents={liveCents}
        targetRel={targetRel}
        confidence={confidence}
        confThreshold={confThreshold}
      />
    </div>
  );
}
