// components/training/layout/footer/GameFooter.tsx
"use client";

import React from "react";
import type { ScaleName } from "@/utils/phrase/scales";
import type { FooterAction } from "./types";

import PlayPauseButton from "./controls/PlayPauseButton";
import KeyScaleSection from "./sections/KeyScaleSection";
import TransportReadout from "./readouts/TransportReadout";
import PitchReadout from "./readouts/PitchReadout";

type TransportProps = React.ComponentProps<typeof TransportReadout>;

type Props = {
  showPlay?: boolean;
  running: boolean;
  onToggle: () => void;

  // live pitch + state
  livePitchHz?: number | null;
  isReady?: boolean;
  error?: string | null;

  confidence: number;      // kept for prop compatibility; unused
  confThreshold?: number;  // kept for prop compatibility; unused

  keySig?: string | null;
  clef?: "treble" | "bass" | null;
  lowHz?: number | null;
  highHz?: number | null;

  /** Preferred: Right-side transport readout (new prop) */
  transport?: TransportProps;

  /** Back-compat: legacy prop name from old footer */
  sessionPanel?: TransportProps;

  /** Left-side section */
  scaleName?: ScaleName | null;
  tonicPc?: number | null; // intentionally unused but preserved

  /** Actions */
  tonicAction?: FooterAction; // “Key”
  arpAction?: FooterAction;   // “Triad”
};

export default function GameFooter({
  showPlay = false,
  running,
  onToggle,
  livePitchHz,
  isReady = false,
  error,
  // confidence, confThreshold intentionally unused
  keySig = null,
  clef = null,
  lowHz = null,
  highHz = null,
  transport,
  sessionPanel,
  scaleName = null,
  tonicAction,
  arpAction,
}: Props) {
  const transportProps = transport ?? sessionPanel;

  return (
    <footer
      className={[
        "w-full bg-transparent overflow-visible",
        "py-1 md:py-1.5 lg:py-2 xl:py-3",
        "px-2 md:px-4 lg:px-6",
      ].join(" ")}
    >
      <div className="w-[90%] mx-auto overflow-visible">
        <div
          className={[
            "rounded-2xl bg-[#f1f1f1] overflow-visible",
            "px-2 md:px-3 lg:px-4",
            "py-1 md:py-1.5 lg:py-2",
            "shadow-[0_6px_24px_rgba(0,0,0,0.12)]",
          ].join(" ")}
        >
          <div
            className={[
              "grid items-center overflow-visible",
              "grid-cols-[1fr_auto_minmax(0,1fr)]",
              "gap-3 md:gap-4",
            ].join(" ")}
          >
            {/* LEFT: Triad/Key actions + Scale readout */}
            <div className="justify-self-start w-full min-w-0 overflow-visible">
              <KeyScaleSection
                scaleName={scaleName ?? null}
                keySig={keySig ?? null}
                tonicAction={tonicAction}
                arpAction={arpAction}
              />
            </div>

            {/* CENTER: Play/Pause (kept perfectly centered) + Pitch readout hugging its left */}
            <div className="justify-self-center overflow-visible relative">
              {/* Pitch pinned to the LEFT side of the play button, without affecting centering */}
              <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2">
                <PitchReadout
                  livePitchHz={livePitchHz}
                  isReady={isReady}
                  error={error}
                  keySig={keySig}
                  clef={clef}
                  lowHz={lowHz}
                  highHz={highHz}
                />
              </div>
              <div className="relative overflow-visible">
                <PlayPauseButton running={running} onToggle={onToggle} />
              </div>
            </div>

            {/* RIGHT: Transport (BPM/Time/Take) tightly packed and right-aligned */}
            <div className="justify-self-end w-full min-w-0 overflow-visible">
              <div className="w-full flex items-center justify-end flex-nowrap">
                {transportProps ? <TransportReadout {...transportProps} /> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
