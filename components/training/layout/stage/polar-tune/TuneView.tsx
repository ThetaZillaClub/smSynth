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

/** nearest-int MIDI helper (undefined-safe) */
function firstTargetMidi(
  phrase: MiniPhrase,
  tonicPc: number,
  targetRel: number | undefined
) {
  const notes = phrase?.notes ?? [];
  if (!notes.length) return undefined;

  if (typeof targetRel === "number") {
    const tpc = ((tonicPc % 12) + 12) % 12;
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
  /** NEW: optional 0..1 progress for the center badge */
  centerProgress01,
}: {
  phrase?: MiniPhrase;
  liveHz: number | null;
  confidence: number;
  confThreshold?: number;
  tonicPc: number;
  scaleName: SolfegeScaleName;
  title?: string;
  /** NEW: 0..1 progress to show as a ring on the badge */
  centerProgress01?: number;
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

  const activeRels = React.useMemo(
    () => deriveActiveRelsFromPhrase(phrase, tonicPc),
    [phrase, tonicPc]
  );

  const targetRel = activeRels[0] ?? 0;
  const targetMidi = React.useMemo(
    () => firstTargetMidi(phrase, tonicPc, targetRel),
    [phrase, tonicPc, targetRel]
  );

  // Center labels
  const centerPrimary = React.useMemo(() => {
    const absPc = (((tonicPc + (targetRel ?? 0)) % 12) + 12) % 12;
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
      {/* Chart */}
      <div style={{ position: "relative", width: w, height: h }}>
        <PolarTuneView
          tonicPc={tonicPc}
          scaleName={scaleName}
          activeRels={activeRels}
          title={title}
          liveRel={liveRel}
          liveCents={liveCents}
          confidence={confidence}
          confThreshold={confThreshold}
          centerPrimary={centerPrimary}
          centerSecondary={centerSecondary}
          centerProgress01={centerProgress01}  // NEW
        />
        {/* live capture overlay (bands only) */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <PolarPitchTune
            width={w}
            height={h}
            liveHz={liveHz}
            confidence={confidence}
            confThreshold={confThreshold}
            tonicPc={tonicPc}
            targetRel={targetRel}
          />
        </div>
      </div>

      {/* Indicator BELOW the chart */}
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
