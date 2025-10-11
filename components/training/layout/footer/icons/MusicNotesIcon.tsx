"use client";

import React from "react";

export default function MusicNotesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "w-5 h-5 md:w-5 md:h-5"}
      fill="currentColor"
      aria-hidden
    >
      <path d="M14 3v9.28A3.5 3.5 0 1 1 12 9.5V6l8-2v6.78A3.5 3.5 0 1 1 18 11V3h-4z" />
    </svg>
  );
}
