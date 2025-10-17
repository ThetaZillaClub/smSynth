"use client";

import React from "react";

/** Generic labeled read-only value */
export default function Readout({
  label,
  value,
  className,
  mono,
  intent = "default",
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  mono?: boolean;
  intent?: "default" | "error";
}) {
  const labelClasses = intent === "error" ? "text-red-600" : "text-[#2d2d2d]";
  const valueClasses = intent === "error" ? "text-red-700" : "text-[#0f0f0f]";
  return (
    <div className={`flex flex-col items-start leading-none ${className ?? ""}`}>
      <div className={`hidden lg:block text-[11px] lg:text-xs ${labelClasses}`}>{label}</div>
      <div className={`text-base md:text-lg leading-tight ${mono ? "font-mono" : ""} ${valueClasses} whitespace-nowrap tabular-nums`}>
        {value}
      </div>
    </div>
  );
}
