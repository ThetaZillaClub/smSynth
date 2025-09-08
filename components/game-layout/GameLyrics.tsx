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
    <div className="w-full flex items-center justify-center">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {words.map((w, i) => {
          const active = i === activeIndex;
          return (
            <span
              key={`${w}-${i}`}
              className={
                active
                  ? // active pill
                    "px-4 py-2 rounded-md bg-[#0f0f0f] text-[#f0f0f0] font-semibold text-lg"
                  : // inactive pill
                    "px-4 py-2 rounded-md bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2] text-lg"
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
