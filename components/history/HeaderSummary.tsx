// components/history/HeaderSummary.tsx
'use client';

type StatCardProps = {
  title: string;
  main: string;
  sub?: string;
};

function StatCard({ title, main, sub }: StatCardProps) {
  return (
    <div
      className="rounded-2xl border bg-gradient-to-b shadow-sm overflow-hidden flex-1 min-w-[140px]"
      style={{
        height: 'clamp(52px, 7vw, 96px)',
        borderColor: '#d2d2d2',
        backgroundImage: 'linear-gradient(to bottom, #f2f2f2, #eeeeee)',
      }}
    >
      <div className="h-full px-3 py-2 flex flex-col justify-center">
        <div
          className="font-semibold text-[#0f0f0f] truncate leading-tight tracking-tight"
          style={{ fontSize: 'clamp(10px, 1vw, 13px)' }}
        >
          {title}
        </div>
        <div
          className="font-semibold tracking-tight text-[#0f0f0f] mt-0.5 truncate leading-tight"
          style={{ fontSize: 'clamp(16px, 2.6vw, 26px)' }}
        >
          {main}
        </div>
        {sub ? (
          <div
            className="hidden xl:block text-[#6b6b6b] mt-0.5 truncate leading-snug"
            style={{ fontSize: 'clamp(10px, 0.95vw, 12px)' }}
            title={sub}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function HeaderSummary({
  finalPct,
  pitchPct,
  timeOnPitchPct,
  pitchMae,
  melodyPct,
  linePct,
  intervalsPct,
}: {
  finalPct: number | null;
  pitchPct: number | null;
  timeOnPitchPct: number | null;
  pitchMae: number | null;
  melodyPct: number | null;
  linePct: number | null;
  intervalsPct: number | null;
}) {
  return (
    <div className="w-full flex flex-nowrap gap-2 sm:gap-3">
      {finalPct != null && <StatCard title="Final" main={`${finalPct.toFixed(0)}%`} />}

      {pitchPct != null && (
        <StatCard
          title="Pitch"
          main={`${pitchPct.toFixed(0)}%`}
          sub={
            timeOnPitchPct != null || pitchMae != null
              ? `On-pitch ${timeOnPitchPct ?? '—'}% • MAE ${pitchMae ?? '—'}¢`
              : undefined
          }
        />
      )}

      {melodyPct != null && <StatCard title="Melody rhythm" main={`${melodyPct.toFixed(0)}%`} />}

      {linePct != null && <StatCard title="Rhythm line" main={`${linePct.toFixed(0)}%`} />}

      {intervalsPct != null && <StatCard title="Intervals" main={`${intervalsPct.toFixed(0)}%`} />}
    </div>
  );
}
