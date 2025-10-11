// components/training/layout/footer/meta/MetaItem.tsx
"use client";

import React from "react";

export default function MetaItem({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start ${className ?? ""}`}>
      <div className="text-xs text-[#2d2d2d] leading-none">{label}</div>
      <div className="text-lg leading-tight text-[#0f0f0f] whitespace-nowrap tabular-nums">
        {value}
      </div>
    </div>
  );
}
