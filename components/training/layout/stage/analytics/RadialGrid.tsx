// analytics/RadialGrid.tsx
"use client";

import * as React from "react";

/** Compact radial progress with title + two sublines */
export function RadialCard({
  title,
  value,
  subLeft,
  subRight,
}: {
  title: string;
  value: number; // 0..100
  subLeft?: string;
  subRight?: string;
}) {
  return (
    <div className="rounded-xl border border-[#dcdcdc] bg-transparent p-3 flex items-center gap-3">
      <RadialProgress value={value} size={64} stroke={8} />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{title}</div>
        <div className="text-sm md:text-base font-semibold text-[#0f0f0f]">{value.toFixed(1)}%</div>
        {(subLeft || subRight) ? (
          <div className="flex items-center gap-2 text-xs text-[#373737]">
            {subLeft ? <span>{subLeft}</span> : null}
            {subLeft && subRight ? <span className="opacity-50">•</span> : null}
            {subRight ? <span>{subRight}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RadialProgress({
  value = 0,
  size = 80,
  stroke = 10,
}: {
  value?: number; // 0..100
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const dash = (clamped / 100) * c;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${clamped.toFixed(1)}%`}
      className="shrink-0"
    >
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <circle r={r} cx={0} cy={0} fill="none" stroke="#e8e8e8" strokeWidth={stroke} />
        <circle
          r={r}
          cx={0}
          cy={0}
          fill="none"
          stroke="#0f0f0f"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90)"
        />
      </g>
    </svg>
  );
}

/** Simple grid wrapper — optional helper */
export function RadialStatGrid({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{children}</div>;
}
