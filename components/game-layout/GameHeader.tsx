"use client";

import React from "react";

type Props = {
  title: string;
  micText: string;
  error?: string | null;
};

export default function GameHeader({ title, micText, error }: Props) {
  return (
    <div className="w-full max-w-5xl flex items-center justify-between gap-4">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <div className={`text-sm ${error ? "text-red-600" : "text-[#2d2d2d]"}`}>
        {error ? `Mic error: ${String(error)}` : micText}
      </div>
    </div>
  );
}
