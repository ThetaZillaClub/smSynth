"use client";

import React from "react";

/** Generic labeled read-only value */
export default function Readout({
  label,
  value,
  className,
  mono,
  intent = "default",
  align = "start",
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  mono?: boolean;
  intent?: "default" | "error";
  /** text + stack alignment */
  align?: "start" | "center" | "end";
}) {
  const labelTone = intent === "error" ? "text-red-600" : "text-[#2d2d2d]";
  const valueTone = intent === "error" ? "text-red-700" : "text-[#0f0f0f]";

  const alignItems =
    align === "center" ? "items-center" : align === "end" ? "items-end" : "items-start";
  const textAlign =
    align === "center" ? "text-center" : align === "end" ? "text-right" : "text-left";

  return (
    <div className={`flex flex-col ${alignItems} leading-none ${className ?? ""}`}>
      <div className={`hidden lg:block text-[11px] lg:text-xs ${labelTone} ${textAlign}`}>
        {label}
      </div>
      <div
        className={`text-base md:text-lg leading-tight ${mono ? "font-mono" : ""} ${valueTone} whitespace-nowrap tabular-nums ${textAlign}`}
      >
        {value}
      </div>
    </div>
  );
}
