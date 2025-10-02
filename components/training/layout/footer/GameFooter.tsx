// components/training/layout/footer/GameFooter.tsx
"use client";

import React from "react";
import GameStats from "./stats/GameStats";
import SessionPanel from "./session/SessionPanel";

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
}: FooterProps) {
  return (
    <footer className="w-full bg-transparent px-4 md:px-6 py-3">
      {/* 90% width container, centered */}
      <div className="w-[90%] mx-auto">
        {/* rounded + outer shadow; no border */}
        <div className="rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.12)] px-3 md:px-4 py-2 bg-[#f1f1f1]">
          <div className="grid grid-cols-[1fr_auto_minmax(0,1fr)] items-center gap-4">
            {/* left spacer (keeps center truly centered) */}
            <div aria-hidden />

            {/* center: play/pause (black icon on #ebebeb) */}
            <div className="justify-self-center">
              {showPlay ? (
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label={running ? "Pause" : "Play"}
                  className="inline-flex items-center justify-center rounded-full p-3 bg-[#ebebeb] text-[#0f0f0f] hover:opacity-90 active:scale-[0.98] transition"
                >
                  {running ? (
                    <svg viewBox="0 0 24 24" className="w-10 h-10" aria-hidden>
                      <path d="M6 5h5v14H6zM13 5h5v14h-5z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-10 h-10" aria-hidden>
                      <path d="M8 5v14l11-7z" fill="currentColor" />
                    </svg>
                  )}
                </button>
              ) : (
                <div className="w-10 h-10" aria-hidden />
              )}
            </div>

            {/* right cluster: session panel + stats on the SAME row */}
            <div className="justify-self-end w-full min-w-0 overflow-hidden">
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
