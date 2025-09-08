"use client";

import React from "react";
import PlayControls from "./PlayControls";

type Props = {
  title: string;
  micText: string;
  error?: string | null;

  /** Show Start/Pause in the header (only when a phrase exists) */
  showPlay?: boolean;
  running?: boolean;
  onToggle?: () => void;
};

export default function GameHeader({
  title,
  micText,
  error,
  showPlay = false,
  running = false,
  onToggle,
}: Props) {
  return (
    <div className="w-full max-w-7xl flex items-center justify-between gap-4 flex-wrap">
      <h1 className="text-3xl font-semibold">{title}</h1>

      <div className="flex items-center gap-3">
        <div className={`text-sm ${error ? "text-red-600" : "text-[#2d2d2d]"}`}>
          {error ? `Mic error: ${String(error)}` : micText}
        </div>

        {showPlay && onToggle ? (
          <PlayControls running={running} onToggle={onToggle} />
        ) : null}
      </div>
    </div>
  );
}
