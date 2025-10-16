// components/training/layout/footer/GameFooter.tsx
"use client";

import React from "react";
import GameStats from "./stats/GameStats";
import SessionPanel from "./session/SessionPanel";
import LeftMetaActions from "./left/LeftMetaActions";
import PlayPauseButton from "./controls/PlayPauseButton";
import type { ScaleName } from "@/utils/phrase/scales";
import type { FooterAction } from "./types";

type FooterSession = React.ComponentProps<typeof SessionPanel>;

type FooterProps = {
  showPlay?: boolean;
  running: boolean;
  onToggle: () => void;

  // stats inputs
  livePitchHz?: number | null;
  isReady?: boolean;
  error?: string | null;

  confidence: number;
  confThreshold?: number;

  keySig?: string | null;
  clef?: "treble" | "bass" | null;
  lowHz?: number | null;
  highHz?: number | null;

  /** Optional: show the new session panel to the right of the play button */
  sessionPanel?: FooterSession;

  /** Left meta panel */
  scaleName?: ScaleName | null;

  /** 🔒 NEW: lock Key to absolute tonic, independent of scale type */
  tonicPc?: number | null;

  /** NEW: footer actions */
  tonicAction?: FooterAction;
  arpAction?: FooterAction;
};

export default function GameFooter({
  showPlay = false,
  running,
  onToggle,
  livePitchHz,
  isReady = false,
  error,
  confidence,
  confThreshold = 0.5,
  keySig = null,
  clef = null,
  lowHz = null,
  highHz = null,
  sessionPanel,
  scaleName = null,
  tonicAction,
  arpAction,
}: FooterProps) {
  return (
    <footer
      className={[
        "w-full bg-transparent overflow-visible",
        // shrink vertical padding earlier (below lg)
        "py-1 md:py-1.5 lg:py-2 xl:py-3",
        // horizontal padding
        "px-2 md:px-4 lg:px-6",
      ].join(" ")}
    >
      <div className="w-[90%] mx-auto overflow-visible">
        <div
          className={[
            "rounded-2xl bg-[#f1f1f1] overflow-visible",
            // inner padding shrinks earlier
            "px-2 md:px-3 lg:px-4",
            "py-1 md:py-1.5 lg:py-2",
            "shadow-[0_6px_24px_rgba(0,0,0,0.12)]",
          ].join(" ")}
        >
          <div
            className={[
              "grid items-center overflow-visible",
              "grid-cols-[1fr_auto_minmax(0,1fr)]",
              // use stable gaps so they don't shrink too early
              "gap-3 md:gap-4",
            ].join(" ")}
          >
            {/* LEFT cluster: Scale + actions */}
            <div className="justify-self-start w-full min-w-0 overflow-visible">
              <LeftMetaActions
                className=""
                scaleName={scaleName ?? undefined}
                keySig={keySig ?? undefined}
                tonicAction={tonicAction}
                arpAction={arpAction}
              />
            </div>

            {/* CENTER: play/pause */}
            <div className="justify-self-center overflow-visible">
              {showPlay ? (
                <div className="relative overflow-visible">
                  <PlayPauseButton running={running} onToggle={onToggle} />
                </div>
              ) : (
                <div className="w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16" aria-hidden />
              )}
            </div>

            {/* RIGHT cluster: session panel + stats */}
            <div className="justify-self-end w-full min-w-0 overflow-visible">
              <div
                className={[
                  "w-full flex items-center justify-end flex-nowrap",
                  // keep outer gap stable so it doesn't collapse too soon
                  "gap-x-4 md:gap-x-5",
                ].join(" ")}
              >
                {/* Let SessionPanel expand and use space; GameStats stays compact */}
                {sessionPanel ? <SessionPanel {...sessionPanel} /> : null}
                <GameStats
                  livePitchHz={livePitchHz}
                  isReady={isReady}
                  error={error}
                  confidence={confidence}
                  confThreshold={confThreshold}
                  keySig={keySig}
                  clef={clef}
                  lowHz={lowHz}
                  highHz={highHz}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
