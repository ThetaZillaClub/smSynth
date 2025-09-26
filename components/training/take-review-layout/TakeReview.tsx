"use client";
import React from "react";
import ReviewStats from "./stats/ReviewStats";
import ReviewFooter from "./footer/ReviewFooter";
import type { TakeScore } from "@/utils/scoring/score";

type Props = {
  haveRhythm: boolean;
  onPlayMelody: () => void | Promise<void>;
  onPlayRhythm: () => void | Promise<void>;
  onPlayBoth: () => void | Promise<void>;
  onStop: () => void;
  onNext: () => void;
  /** NEW: high-detail scoring for this take */
  score?: TakeScore | undefined;
  /** NEW: running totals across takes (foundation for exercise stats) */
  sessionScores?: TakeScore[];
};

export default function TakeReview({
  haveRhythm,
  onPlayMelody,
  onPlayRhythm,
  onPlayBoth,
  onStop,
  onNext,
  score,
  sessionScores = [],
}: Props) {
  return (
    <div className="mt-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <ReviewStats score={score} sessionScores={sessionScores} />
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
