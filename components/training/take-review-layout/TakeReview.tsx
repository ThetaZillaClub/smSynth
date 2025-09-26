"use client";
import React from "react";
import ReviewStats from "./stats/ReviewStats";
import ReviewFooter from "./footer/ReviewFooter";

type Props = {
  haveRhythm: boolean;
  onPlayMelody: () => void | Promise<void>;
  onPlayRhythm: () => void | Promise<void>;
  onPlayBoth: () => void | Promise<void>;
  onStop: () => void;
  onNext: () => void;
};

export default function TakeReview({
  haveRhythm,
  onPlayMelody,
  onPlayRhythm,
  onPlayBoth,
  onStop,
  onNext,
}: Props) {
  return (
    <div className="mt-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <ReviewStats />

      <ReviewFooter
        haveRhythm={haveRhythm}
        onPlayMelody={onPlayMelody}
        onPlayRhythm={onPlayRhythm}
        onPlayBoth={onPlayBoth}
        onStop={onStop}
        onNext={onNext}
      />
    </div>
  );
}
