// components/training/layout/stage/analytics/Header.tsx
"use client";

export default function Header({
  title,
  finalPct,
  finalLetter,
}: {
  title: string;
  finalPct: number;
  finalLetter: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-base md:text-lg font-semibold">{title}</div>
      <div className="inline-flex items-center rounded-full border border-[#dcdcdc] px-2.5 py-1 text-sm font-semibold text-[#0f0f0f]">
        <span>{finalPct.toFixed(1)}%</span>
        <span className="mx-1 opacity-50">•</span>
        <span>{finalLetter}</span>
      </div>
    </div>
  );
}
