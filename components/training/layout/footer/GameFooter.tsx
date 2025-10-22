// components/training/layout/footer/GameFooter.tsx
"use client";

import React from "react";
import type { ScaleName } from "@/utils/phrase/scales";
import type { FooterAction } from "./types";

import PlayPauseButton from "./controls/PlayPauseButton";
import KeyScaleSection from "./sections/KeyScaleSection";
import TransportReadout from "./readouts/TransportReadout";
import PitchReadout from "./readouts/PitchReadout";
import RhythmIndicator from "./readouts/RhythmIndicator";

type TransportProps = React.ComponentProps<typeof TransportReadout>;

type Props = {
  showPlay?: boolean;
  running: boolean;
  onToggle: () => void;

  livePitchHz?: number | null;
  isReady?: boolean;
  error?: string | null;

  confidence: number;
  confThreshold?: number;

  keySig?: string | null;
  clef?: "treble" | "bass" | null;
  lowHz?: number | null;
  highHz?: number | null;

  transport?: TransportProps;
  sessionPanel?: TransportProps;

  scaleName?: ScaleName | null;
  tonicPc?: number | null;

  tonicAction?: FooterAction;
  arpAction?: FooterAction;

  rhythmPulse?: boolean;
  /** if false, hide the indicator entirely */
  rhythmEnabled?: boolean;
};

export default function GameFooter({
  showPlay = false,
  running,
  onToggle,
  livePitchHz,
  isReady = false,
  error,
  keySig = null,
  clef = null,
  lowHz = null,
  highHz = null,
  transport,
  sessionPanel,
  scaleName = null,
  tonicAction,
  arpAction,
  rhythmPulse = false,
  rhythmEnabled = true,
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
            {/* LEFT: Key/Triad + scale */}
            <div className="justify-self-start w-full min-w-0 overflow-visible">
              <KeyScaleSection
                scaleName={scaleName ?? null}
                keySig={keySig ?? null}
                tonicAction={tonicAction}
                arpAction={arpAction}
              />
            </div>

            {/* CENTER: Pitch (left) + Play (center) + symmetric spacer/indicator (right) */}
            <div className="justify-self-center overflow-visible">
              <div className="flex items-center">
                {/* Pitch readout to the LEFT of the button */}
                <div className="mr-3">
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

                {/* Play/Pause stays perfectly centered */}
                <div className="relative overflow-visible">
                  {showPlay ? (
                    <PlayPauseButton running={running} onToggle={onToggle} />
                  ) : (
                    <div
                      className="w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16"
                      aria-hidden
                    />
                  )}
                </div>

                {/* RIGHT: indicator only if enabled; otherwise a spacer with the same width */}
                {rhythmEnabled ? (
                  <div className="ml-4 md:ml-5">
                    <RhythmIndicator active={rhythmPulse} />
                  </div>
                ) : (
                  // spacer keeps the play button perfectly centered when indicator is hidden
                  <div className="ml-4 md:ml-5 w-[7rem] h-7 md:h-7 flex-none" aria-hidden />
                )}
              </div>
            </div>

            {/* RIGHT: Transport */}
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
