"use client";

import React from "react";

export default function PlayControls({
  running,
  onToggle,
}: {
  running: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`px-4 py-2 rounded-md font-medium transition duration-200 active:scale-[0.98] ${
        running
          ? "bg-[#ebebeb] border border-[#d2d2d2] text-[#0f0f0f] hover:opacity-90"
          : "bg-[#0f0f0f] text-[#f0f0f0] hover:opacity-90"
      }`}
    >
      {running ? "Pause" : "Start"}
    </button>
  );
}
