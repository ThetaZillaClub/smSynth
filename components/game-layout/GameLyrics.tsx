"use client";
import React from "react";

export default function GameLyrics({
  words,
  activeIndex,
}: {
  words: string[];
  activeIndex: number;
}) {
  return (
    <div className="w-full max-w-5xl flex items-center justify-center">
      <div className="flex flex-wrap gap-2 md:gap-3 items-center justify-center">
        {words.map((w, i) => {
          const active = i === activeIndex;
          return (
            <span
              key={`${w}-${i}`}
              className={
                active
                  ? "px-3 py-1.5 rounded-md bg-[#0f0f0f] text-[#f0f0f0] font-semibold"
                  : "px-3 py-1.5 rounded-md bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2]"
              }
            >
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
}
