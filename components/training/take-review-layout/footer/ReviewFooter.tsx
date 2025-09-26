"use client";
import React from "react";

type Props = {
  haveRhythm: boolean;
  onPlayMelody: () => void | Promise<void>;
  onPlayRhythm: () => void | Promise<void>;
  onPlayBoth: () => void | Promise<void>;
  onStop: () => void;
  onNext: () => void;
};

export default function ReviewFooter({
  haveRhythm,
  onPlayMelody,
  onPlayRhythm,
  onPlayBoth,
  onStop,
  onNext,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={onPlayMelody}
        className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-sm"
      >
        ▶︎ Play Melody
      </button>
      <button
        onClick={onPlayRhythm}
        className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-sm"
        disabled={!haveRhythm}
      >
        ▶︎ Play Rhythm
      </button>
      <button
        onClick={onPlayBoth}
        className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-sm"
        disabled={!haveRhythm}
      >
        ▶︎ Play Both
      </button>
      <button
        onClick={onStop}
        className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-white text-sm"
      >
        ■ Stop
      </button>

      <div className="flex-1" />

      <button
        onClick={onNext}
        className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-[#f8f8f8] text-sm"
      >
        Next Phrase →
      </button>
    </div>
  );
}
