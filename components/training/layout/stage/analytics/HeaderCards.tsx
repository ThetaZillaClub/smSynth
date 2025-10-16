// components/training/layout/stage/analytics/HeaderCards.tsx
"use client";

function StatCard({ title, main, sub }: { title: string; main: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[#dcdcdc] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-4 shadow-sm">
      <div className="text-sm font-semibold text-[#0f0f0f]">{title}</div>
      <div className="text-2xl md:text-3xl font-semibold tracking-tight text-[#0f0f0f] mt-1">{main}</div>
      {sub ? <div className="text-xs text-[#6b6b6b] mt-1">{sub}</div> : null}
    </div>
  );
}

export default function HeaderCards({
  finalPct,
  finalLetter,
  pitchPct,
  timeOnPitchPct,
  pitchMae,
  melPct,
  melHit,
  melMeanAbs,
  intervalsPct,
}: {
  finalPct: number;
  finalLetter: string;
  pitchPct: number;
  timeOnPitchPct: number;
  pitchMae: number;
  melPct: number;
  melHit: number;
  melMeanAbs: number;
  intervalsPct: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <StatCard title={`Final (${finalLetter})`} main={`${finalPct.toFixed(1)}%`} />
      <StatCard title="Pitch" main={`${pitchPct.toFixed(1)}%`} sub={`On-pitch ${timeOnPitchPct}% • MAE ${pitchMae}¢`} />
      <StatCard title="Melody rhythm" main={`${melPct.toFixed(1)}%`} sub={`Hit ${melHit}% • μ|Δt| ${melMeanAbs}ms`} />
      <StatCard title="Intervals" main={`${intervalsPct.toFixed(1)}%`} sub="Per-take breakdown below" />
    </div>
  );
}
