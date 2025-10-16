// components/training/layout/stage/side-panel/CourseNavPanel.tsx
"use client";

import * as React from "react";

export type LessonRef = { slug: string; title?: string };
export type LessonSuggestion = LessonRef & { reason?: string };

export default function CourseNavPanel({
  currentLesson,
  prevLesson,
  nextLesson,
  suggestions = [],
  onRepeat,
  onGoTo,
  // onBrowseAll, // removed from UI per request
}: {
  currentLesson?: LessonRef | null;
  prevLesson?: LessonRef | null;
  nextLesson?: LessonRef | null;
  suggestions?: LessonSuggestion[];
  onRepeat?: () => void;
  onGoTo?: (slug: string) => void;
  // onBrowseAll?: () => void; // removed from UI per request
}) {
  const disabled = !onGoTo;

  return (
    <div className="flex flex-col gap-3" data-testid="course-nav-panel">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="text-base md:text-lg font-semibold text-[#0f0f0f]">
          Course navigation
        </div>
        {currentLesson?.slug ? (
          <Chip
            title="Current lesson"
            text={currentLesson.title || currentLesson.slug}
            className="max-w-[60%] truncate"
          />
        ) : null}
      </header>

      {/* Primary actions (analytics-style cards) */}
      <div className="grid grid-cols-1 gap-2">
        <ActionCard
          label="Repeat this lesson"
          detail="Start a fresh session"
          icon="repeat"
          onClick={onRepeat}
          disabled={!onRepeat}
          data-testid="repeat-lesson"
        />
        <ActionCard
          label={nextLesson?.title ? `Next: ${nextLesson.title}` : "Next lesson"}
          detail={nextLesson?.slug || "Pick your next step"}
          icon="next"
          onClick={() => nextLesson?.slug && onGoTo?.(nextLesson.slug)}
          disabled={disabled || !nextLesson?.slug}
          data-testid="next-lesson"
        />
        <ActionCard
          label={prevLesson?.title ? `Previous: ${prevLesson.title}` : "Previous lesson"}
          detail={prevLesson?.slug || "Go back one step"}
          icon="prev"
          onClick={() => prevLesson?.slug && onGoTo?.(prevLesson.slug)}
          disabled={disabled || !prevLesson?.slug}
          data-testid="prev-lesson"
        />
      </div>

      {/* Recommended next steps (analytics-style cards) */}
      <section className="mt-1">
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-1">
          Recommended next steps
        </div>

        {suggestions.length === 0 ? (
          <div className="rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-3 shadow-sm text-sm text-[#373737]">
            We’ll show targeted lessons here based on your report.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {suggestions.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => onGoTo?.(s.slug)}
                disabled={disabled}
                className={[
                  "w-full text-left rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee]",
                  "p-3 hover:shadow-md shadow-sm active:scale-[0.99] transition",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
                  disabled ? "opacity-70 cursor-not-allowed" : "",
                ].join(" ")}
                title={s.title || s.slug}
                aria-label={`Open ${s.title || s.slug}`}
                data-testid="lesson-suggestion"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0f0f0f] truncate">
                      {s.title || s.slug}
                    </div>
                    <div className="text-xs text-[#6b6b6b] truncate">{s.slug}</div>
                  </div>
                  {s.reason ? (
                    <Chip text={s.reason} title="Why suggested" />
                  ) : (
                    <Chip text="Suggested" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* UI bits                                                        */
/* ────────────────────────────────────────────────────────────── */

function ActionCard({
  label,
  detail,
  icon,
  onClick,
  disabled,
  ...rest
}: {
  label: string;
  detail?: string;
  icon?: "repeat" | "next" | "prev";
  onClick?: () => void;
  disabled?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "text-left rounded-2xl border p-3 md:p-4 transition",
        "bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] border-[#d2d2d2]",
        disabled
          ? "opacity-70 cursor-not-allowed"
          : "shadow-sm hover:shadow-md active:scale-[0.99]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
      ].join(" ")}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      <div className="flex items-center gap-2">
        <Icon kind={icon} />
        <div className="min-w-0">
          <div className="text-sm md:text-base font-semibold text-[#0f0f0f] truncate">
            {label}
          </div>
          {detail ? <div className="text-xs text-[#373737] truncate">{detail}</div> : null}
        </div>
      </div>
    </button>
  );
}

function Chip({
  text,
  title,
  className = "",
}: {
  text: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border border-[#dcdcdc] bg-white",
        "px-2.5 py-1 text-xs font-medium text-[#373737] shadow-sm",
        className,
      ].join(" ")}
      title={title || text}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#0f0f0f] mr-1.5" aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
}

function Icon({ kind }: { kind?: "repeat" | "next" | "prev" }) {
  return (
    <span
      className="shrink-0 inline-grid place-items-center w-8 h-8 rounded-full bg-[#f4f4f4] border border-[#e6e6e6] text-[#0f0f0f]"
      aria-hidden
    >
      {kind === "repeat" ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
          <path
            d="M17 1l4 4-4 4V6H7a3 3 0 0 0-3 3v1H2V9a5 5 0 0 1 5-5h10V1zM7 23l-4-4 4-4v3h10a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5H7v3z"
            fill="currentColor"
          />
        </svg>
      ) : kind === "next" ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
          <path d="M8 5l8 7-8 7V5z" fill="currentColor" />
        </svg>
      ) : kind === "prev" ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
          <path d="M16 5l-8 7 8 7V5z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
          <circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" />
        </svg>
      )}
    </span>
  );
}
