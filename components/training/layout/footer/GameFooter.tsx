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
  tonicPc = null, // accepted for future use; not rendered directly here
  tonicAction,
  arpAction,
}: FooterProps) {
  return (
    <footer className="w-full bg-transparent px-4 md:px-6 py-3 overflow-visible">
      <div className="w-[90%] mx-auto overflow-visible">
        <div className="rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.12)] px-3 md:px-4 py-2 bg-[#f1f1f1] overflow-visible">
          <div className="grid grid-cols-[1fr_auto_minmax(0,1fr)] items-center gap-4 overflow-visible">
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
                <div className="relative p-1 overflow-visible">
                  <PlayPauseButton running={running} onToggle={onToggle} />
                </div>
              ) : (
                <div className="w-16 h-16" aria-hidden />
              )}
            </div>

            {/* RIGHT cluster: session panel + stats */}
            <div className="justify-self-end w-full min-w-0 overflow-visible">
              <div className="w-full flex items-center justify-end gap-x-4 flex-nowrap">
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
