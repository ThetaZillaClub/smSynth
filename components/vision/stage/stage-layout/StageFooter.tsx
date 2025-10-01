// components/vision/stage/stage-layout/StageFooter.tsx
"use client";

import React from "react";

type Phase = "idle" | "lead" | "run" | "done";

type Props = {
  phase: Phase;
  uiBeat: number;
  runBeats: number;
  matched: number;
  resultMs: number | null;
  error: string | null;
  onStart: () => void;
  onReset: () => void;
};

export default function StageFooter({
  phase,
  uiBeat,
  runBeats,
  matched,
  resultMs,
  error,
  onStart,
  onReset,
}: Props) {
  const running = phase === "lead" || phase === "run";

  const onToggle = () => {
    if (phase === "idle") onStart();
    else if (phase === "done") {
      onReset();
      onStart();
    }
  };

  return (
    <footer className="w-full bg-transparent px-4 md:px-6 py-3">
      <div className="w-[90%] mx-auto">
        {/* lighter white card + soft shadow */}
        <div className="rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.12)] px-3 md:px-4 py-2 bg-white">
          <div className="grid grid-cols-[1fr_auto_minmax(0,1fr)] items-center gap-4">
            {/* left spacer to keep center truly centered */}
            <div aria-hidden />

            {/* center: play/pause on light gray chip */}
            <div className="justify-self-center">
              <button
                type="button"
                onClick={onToggle}
                aria-label={running ? "Pause" : "Play"}
                disabled={running}
                className="inline-flex items-center justify-center rounded-full p-3 bg-[#ebebeb] text-[#0f0f0f] hover:opacity-100 active:scale-[0.98] transition disabled:opacity-100 disabled:cursor-not-allowed"
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
            </div>

            {/* right: status/errors */}
            <div className="justify-self-end w-full min-w-0 overflow-hidden">
              <div className="w-full flex items-center justify-end gap-x-4 flex-nowrap">
                {phase === "done" ? (
                  <div className="text-xs text-[#0f0f0f] truncate">
                    {resultMs != null ? (
                      <>
                        Calibrated delay: <span className="font-semibold">{resultMs} ms</span> • matched:{" "}
                        <span className="font-semibold">{matched}/{runBeats}</span>
                      </>
                    ) : (
                      "No reliable matches — try again."
                    )}
                  </div>
                ) : phase === "lead" ? (
                  <div className="flex items-center gap-2 text-xs text-[#2d2d2d]">
                    <span>Lead-in</span>
                    <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md bg-white text-[#0f0f0f] border border-[#dcdcdc] font-semibold">
                      {uiBeat}
                    </span>
                  </div>
                ) : phase === "run" ? (
                  <div className="flex items-center gap-2 text-xs text-[#2d2d2d]">
                    <span>Recording taps</span>
                    <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md bg-white text-[#0f0f0f] border border-[#dcdcdc] font-semibold">
                      {uiBeat}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-[#6b6b6b]">Ready</div>
                )}

                {error ? (
                  <span className="px-2 py-1 rounded border border-red-300 bg-red-50 text-red-700 text-xs">
                    {error}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
