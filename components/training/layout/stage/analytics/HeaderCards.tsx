// components/training/layout/stage/analytics/HeaderCards.tsx
"use client";

type StatCardProps = {
  title: string;
  main: string;
  sub?: string;
  className?: string;
};

function StatCard({ title, main, sub, className = "" }: StatCardProps) {
  return (
    <div
      className={[
        "rounded-2xl border bg-gradient-to-b shadow-sm overflow-hidden",
        "flex-1 min-w-0", // never wrap; shrink instead
        className,
      ].join(" ")}
      style={{
        // smaller clamp so cards can squeeze more on narrow viewports
        height: "clamp(52px, 7vw, 96px)",
        borderColor: "#d2d2d2",
        backgroundImage: "linear-gradient(to bottom, #f2f2f2, #eeeeee)",
      }}
    >
      <div className="h-full px-3 py-2 flex flex-col justify-center">
        <div
          className="font-semibold text-[#0f0f0f] truncate leading-tight tracking-tight"
          style={{ fontSize: "clamp(10px, 1vw, 13px)" }}
        >
          {title}
        </div>
        <div
          className="font-semibold tracking-tight text-[#0f0f0f] mt-0.5 truncate leading-tight"
          style={{ fontSize: "clamp(16px, 2.6vw, 26px)" }}
        >
          {main}
        </div>
        {sub ? (
          // Hide the third line on smaller screens to avoid clipping.
          <div
            className="hidden xl:block text-[#6b6b6b] mt-0.5 truncate leading-snug"
            style={{ fontSize: "clamp(10px, 0.95vw, 12px)" }}
            title={sub}
          >
            {sub}
          </div>
        ) : null}
      </div>
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
    // Single, non-wrapping row at all sizes.
    <div className="w-full flex flex-nowrap gap-2 sm:gap-3">
      <StatCard title={`Final (${finalLetter})`} main={`${finalPct.toFixed(1)}%`} />
      <StatCard
        title="Pitch"
        main={`${pitchPct.toFixed(1)}%`}
        sub={`On-pitch ${timeOnPitchPct}% • MAE ${pitchMae}¢`}
      />
      <StatCard
        title="Melody rhythm"
        main={`${melPct.toFixed(1)}%`}
        sub={`Hit ${melHit}% • μ|Δt| ${melMeanAbs}ms`}
      />
      <StatCard
        title="Intervals"
        main={`${intervalsPct.toFixed(1)}%`}
        sub="Per-take breakdown below"
      />
    </div>
  );
}
