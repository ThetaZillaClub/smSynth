// components/training/layout/footer/controls/PlayPauseButton.tsx
"use client";

import React from "react";

export default function PlayPauseButton({
  running,
  onToggle,
}: {
  running: boolean;
  onToggle: () => void;
}) {
  const base = [
    "relative inline-flex items-center justify-center",
    "w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full",
    "bg-gradient-to-b from-[#fefefe] to-zinc-50 text-zinc-900",
    "ring-1 ring-inset ring-black/5",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(0,0,0,0.08)]",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(0,0,0,0.12)]",
    "hover:ring-black/10",
    "active:scale-95",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40",
    "transition-all duration-200",
    "overflow-visible",
  ].join(" ");

  const runningAccent = running
    ? "ring-green-500/40 shadow-[0_0_0_3px_rgba(16,185,129,0.15),0_12px_32px_rgba(16,185,129,0.22)]"
    : "";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={running ? "Pause" : "Play"}
      aria-pressed={running}
      title={running ? "Pause" : "Play"}
      className={`${base} ${runningAccent}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute -inset-2 rounded-full blur transition-opacity duration-300 bg-green-400/25 ${
          running ? "opacity-100" : "opacity-0"
        }`}
      />
      <span className="relative block w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9">
        {/* Play */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`absolute inset-0 w-full h-full transition-opacity duration-150 ${
            running ? "opacity-0" : "opacity-100"
          }`}
        >
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
        {/* Pause */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`absolute inset-0 w-full h-full transition-opacity duration-150 ${
            running ? "opacity-100" : "opacity-0"
          }`}
        >
          <path d="M6 5h5v14H6zM13 5h5v14h-5z" fill="currentColor" />
        </svg>
      </span>
    </button>
  );
}
