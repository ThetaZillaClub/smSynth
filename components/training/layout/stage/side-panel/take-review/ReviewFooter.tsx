"use client";
import React from "react";

export default function ReviewFooter({
  haveRhythm,
  onPlayMelody,
  onPlayRhythm,
  onPlayBoth,
  onStop,
  onNext,
  canProceed = true,
  onRetry,
}: {
  haveRhythm: boolean;
  onPlayMelody: () => void | Promise<void>;
  onPlayRhythm: () => void | Promise<void>;
  onPlayBoth: () => void | Promise<void>;
  onStop: () => void;
  onNext: () => void;
  canProceed?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-2 flex items-center justify-between">
      <div className="flex gap-2">
        <button
          className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-sm hover:bg-[#f8f8f8]"
          onClick={onPlayMelody}
          title="Play the melody"
        >
          Play melody
        </button>
        {haveRhythm && (
          <>
            <button
              className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-sm hover:bg-[#f8f8f8]"
              onClick={onPlayRhythm}
              title="Play the rhythm"
            >
              Play rhythm
            </button>
            <button
              className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-sm hover:bg-[#f8f8f8]"
              onClick={onPlayBoth}
              title="Play both together"
            >
              Play both
            </button>
          </>
        )}
        <button
          className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-sm hover:bg-[#f8f8f8]"
          onClick={onStop}
          title="Stop playback"
        >
          Stop
        </button>
      </div>

      <div className="flex items-center gap-2">
        {!canProceed ? (
          <button
            onClick={onRetry ?? onNext}
            className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-[#0f0f0f] text-[#f0f0f0] text-sm hover:opacity-90"
            title="Try again to pass"
          >
            Try again
          </button>
        ) : (
          <button
            onClick={onNext}
            className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-[#0f0f0f] text-[#f0f0f0] text-sm hover:opacity-90"
            title="Proceed to the next round"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
