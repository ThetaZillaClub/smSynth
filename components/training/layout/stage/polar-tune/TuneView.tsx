'use client';
import * as React from 'react';
import PolarTuneView from "./PolarTuneView";
import PolarPitchTune from "./PolarPitchTune";
import { hzToMidi, relPcFloat } from "./polar-helpers";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";

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

export default function TuneView({
  phrase,
  liveHz,
  confidence,
  confThreshold = 0.5,
  tonicPc,
  scaleName,
  title,
  // phase prop still accepted but not used
}: {
  phrase?: MiniPhrase;
  liveHz: number | null;
  confidence: number;
  confThreshold?: number;
  tonicPc: number;
  scaleName: SolfegeScaleName;
  title?: string;
  phase?: string; // "call" | "record" | "rest" | "idle"
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
    <div
      ref={hostRef}
      className="w-full h-full flex items-center justify-center"
    >
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
        />
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
        {/* removed status overlay */}
      </div>
    </div>
  );
}
