// components/training/layout/stage/side-panel/CourseNavPanel.tsx
"use client";

import * as React from "react";

export type LessonRef = { slug: string; title?: string; summary?: string };
export type LessonSuggestion = LessonRef & { reason?: string };

export default function CourseNavPanel(props: {
  currentLesson?: LessonRef | null;
  prevLesson?: LessonRef | null;
  nextLesson?: LessonRef | null;
  /** Kept for API compatibility but not used in UI */
  suggestions?: LessonSuggestion[];
  onRepeat?: () => void;
  onGoTo?: (slug: string) => void;
}) {
  const {
    currentLesson,
    prevLesson,
    nextLesson,
    // suggestions intentionally not destructured/used
    onRepeat,
    onGoTo,
  } = props;

  const disabled = !onGoTo;

  return (
    <div className="flex flex-col gap-3" data-testid="course-nav-panel">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="text-base md:text-lg font-semibold text-[#0f0f0f]">
          Course navigation
        </div>
        {/* Removed "Current lesson" chip per request */}
      </header>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-3">
        <ActionCard
          eyebrow="Repeat this lesson"
          label={currentLesson?.title || "Current lesson"}
          detail={currentLesson?.summary}
          icon="repeat"
          onClick={onRepeat}
          disabled={!onRepeat}
          data-testid="repeat-lesson"
          aria-label="Repeat this lesson"
        />

        <ActionCard
          eyebrow="Next"
          label={nextLesson?.title || "Next lesson"}
          detail={nextLesson?.summary}
          icon="next"
          onClick={() => nextLesson?.slug && onGoTo?.(nextLesson.slug)}
          disabled={disabled || !nextLesson?.slug}
          data-testid="next-lesson"
          aria-label="Go to next lesson"
        />

        <ActionCard
          eyebrow="Previous"
          label={prevLesson?.title || "Previous lesson"}
          detail={prevLesson?.summary}
          icon="prev"
          onClick={() => prevLesson?.slug && onGoTo?.(prevLesson.slug)}
          disabled={disabled || !prevLesson?.slug}
          data-testid="prev-lesson"
          aria-label="Go to previous lesson"
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* UI bits                                                        */
/* ────────────────────────────────────────────────────────────── */

function ActionCard({
  eyebrow,
  label,
  detail,
  icon,
  onClick,
  disabled,
  ...rest
}: {
  eyebrow?: string; // small headline inside the card
  label: string;    // main title (lesson title)
  detail?: string;  // summary
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
        "group relative text-left rounded-2xl border p-3 md:p-4 transition",
        "bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] border-[#d2d2d2]",
        disabled
          ? "opacity-70 cursor-not-allowed"
          : "shadow-sm hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 hover:ring-1 hover:ring-[#d3d3d3]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
      ].join(" ")}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      <div className="flex items-start gap-2">
        <Icon kind={icon} />
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-xs md:text-sm uppercase tracking-wide text-[#6b6b6b]">
              {eyebrow}
            </div>
          ) : null}
          <div className="text-sm md:text-base font-semibold text-[#0f0f0f] truncate">
            {label}
          </div>
          {detail ? (
            <div className="text-xs text-[#373737] truncate">{detail}</div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function Icon({ kind }: { kind?: "repeat" | "next" | "prev" }) {
  return (
    <span
      className="shrink-0 inline-grid place-items-center w-8 h-8 rounded-full bg-[#f4f4f4] border border-[#e6e6e6] text-[#0f0f0f] group-hover:bg-white"
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
