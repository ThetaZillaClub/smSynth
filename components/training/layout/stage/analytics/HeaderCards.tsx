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
        "flex-1 min-w-0",
        className,
      ].join(" ")}
      style={{
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

type Visibility = {
  showPitch: boolean;
  showIntervals: boolean;
  showMelodyRhythm: boolean;
  showRhythmLine: boolean;
};

export default function HeaderCards({
  finalPct,
  finalLetter,
  pitchPct,
  timeOnPitchPct,
  pitchMae,
  melPct,
  melHit,
  melMeanAbs,
  linePct,
  lineHit,
  lineMeanAbs,
  intervalsPct,
  /** NEW: visibility gating */
  visibility = { showPitch: true, showIntervals: true, showMelodyRhythm: true, showRhythmLine: true },
  /** whether any take actually had a rhythm-line evaluation */
  lineEnabled = false,
}: {
  finalPct: number;
  finalLetter: string;
  pitchPct: number;
  timeOnPitchPct: number;
  pitchMae: number;
  melPct: number;
  melHit: number;
  melMeanAbs: number;
  linePct?: number;
  lineHit?: number;
  lineMeanAbs?: number;
  intervalsPct: number;
  visibility?: Visibility;
  lineEnabled?: boolean;
}) {
  return (
    <div className="w-full flex flex-nowrap gap-2 sm:gap-3">
      <StatCard title={`Final (${finalLetter})`} main={`${finalPct.toFixed(1)}%`} />

      {visibility.showPitch && (
        <StatCard
          title="Pitch"
          main={`${pitchPct.toFixed(1)}%`}
          sub={`On-pitch ${timeOnPitchPct}% • MAE ${pitchMae}¢`}
        />
      )}

      {visibility.showMelodyRhythm && (
        <StatCard
          title="Melody rhythm"
          main={`${melPct.toFixed(1)}%`}
          sub={`Hit ${melHit}% • μ|Δt| ${melMeanAbs}ms`}
        />
      )}

      {visibility.showRhythmLine && lineEnabled && typeof linePct === "number" && (
        <StatCard
          title="Rhythm line"
          main={`${linePct.toFixed(1)}%`}
          sub={`Hit ${lineHit ?? 0}% • μ|Δt| ${lineMeanAbs ?? 0}ms`}
        />
      )}

      {visibility.showIntervals && (
        <StatCard
          title="Intervals"
          main={`${intervalsPct.toFixed(1)}%`}
          sub="Per-take breakdown below"
        />
      )}
    </div>
  );
}
