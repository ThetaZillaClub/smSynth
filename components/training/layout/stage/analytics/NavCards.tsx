// components/training/layout/stage/analytics/NavCards.tsx
"use client";

export type ViewKey =
  | "performance"
  | "pitch-acc"
  | "pitch-prec"
  | "melody"
  | "line"
  | "intervals";

function PickerButton({
  title,
  subtitle,
  onClick,
  active,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={title}
      className={[
        "group text-left rounded-2xl border bg-gradient-to-b w-full",
        "h-[clamp(52px,3vw,84px)] px-2.5 sm:px-3 md:px-4",
        "flex items-center justify-between gap-3 transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
        active
          ? "from-[#fafafa] to-[#f3f3f3] border-[#e6e6e6] shadow-md"
          : "from-[#f2f2f2] to-[#eeeeee] border-[#d2d2d2] shadow-sm hover:shadow-md",
      ].join(" ")}
    >
      <div className="min-w-0">
        <div
          className="font-semibold text-[#0f0f0f] truncate leading-tight tracking-tight"
          style={{ fontSize: "clamp(12px, 1vw, 18px)" }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            className="text-[#373737] mt-0.5 truncate leading-snug"
            style={{ fontSize: "clamp(10px, .5vw, 14px)" }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      <div
        className={[
          "shrink-0 rounded-full shadow-sm bg-[#f4f4f4] border border-[#e6e6e6]",
          "w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 grid place-items-center",
          active ? "text-[#0f0f0f]" : "text-[#0f0f0f]/70 group-hover:text-[#0f0f0f]",
          "transition",
        ].join(" ")}
        aria-hidden
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="-mr-0.5">
          <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  );
}

export default function NavCards({
  active,
  setActive,
  /** NEW: restrict which views are shown */
  available = ["performance", "pitch-acc", "pitch-prec", "melody", "line", "intervals"],
}: {
  active: ViewKey;
  setActive: (v: ViewKey) => void;
  available?: ViewKey[];
}) {
  const meta: Record<ViewKey, { title: string; subtitle: string }> = {
    performance: { title: "Performance over takes", subtitle: "Final score trend" },
    "pitch-acc": { title: "Pitch accuracy", subtitle: "On-pitch% per note" },
    "pitch-prec": { title: "Pitch precision", subtitle: "MAE (¢) per note" },
    melody: { title: "Melody coverage", subtitle: "By duration per take" },
    line: { title: "Rhythm line timing", subtitle: "Average credit by beat duration" },
    intervals: { title: "Intervals", subtitle: "Class accuracy per take" },
  };

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {available.map((k) => (
        <PickerButton
          key={k}
          active={active === k}
          title={meta[k].title}
          subtitle={meta[k].subtitle}
          onClick={() => setActive(k)}
        />
      ))}
    </div>
  );
}
