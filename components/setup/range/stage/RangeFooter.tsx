// components/setup/range/stage/RangeFooter.tsx
"use client";

import React from "react";
import PlayPauseButton from "@/components/training/layout/footer/controls/PlayPauseButton";

export default function RangeFooter({
  displayNote,
  hasCapture,
  isDone,
  error,
  running,
  onToggle,
  onReset,    // soft reset (during calibration)
  onRestart,  // full restart (after completion)
  onConfirm,  // ✅ confirm capture
}: {
  displayNote: string | null;
  hasCapture: boolean;
  isDone: boolean;
  error: string | null;
  running: boolean;
  onToggle: () => void;
  onReset: () => void;
  onRestart: () => void;
  onConfirm: () => void;
}) {
  // Stable-hitbox circle button (small). Only the INNER icon scales on press.
  function SmallCircleButton({
    onClick,
    "aria-label": ariaLabel,
    title,
    children,
    disabled = false,
  }: {
    onClick: () => void;
    "aria-label": string;
    title?: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) {
    const [pressed, setPressed] = React.useState(false);

    const base = [
      "relative inline-flex items-center justify-center select-none touch-manipulation",
      // HITBOX stays stable – no transforms here
      "w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full",
      "bg-gradient-to-b from-[#fefefe] to-zinc-50",
      "ring-1 ring-inset ring-black/5",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_6px_18px_rgba(0,0,0,0.08)]",
      "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_22px_rgba(0,0,0,0.12)]",
      "hover:ring-black/10",
      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40",
      "transition-shadow duration-200",
      "overflow-visible",
      disabled ? "cursor-default text-[#cccccc]" : "cursor-pointer text-zinc-900",
    ].join(" ");

    return (
      <button
        type="button"
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        className={base}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (disabled) return;
          onClick();
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          if (e.button === 0) setPressed(true);
        }}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === " " || e.key === "Enter") setPressed(true);
        }}
        onKeyUp={() => setPressed(false)}
      >
        {/* Only this inner content scales; hitbox remains constant */}
        <span
          className={[
            "relative block w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7",
            "transition-transform duration-75 will-change-transform",
            pressed && !disabled ? "scale-95" : "scale-100",
          ].join(" ")}
        >
          {children}
        </span>
      </button>
    );
  }

  // Stable-hitbox circle button (large). Only the INNER icon scales on press.
  function LargeCircleButton({
    onClick,
    "aria-label": ariaLabel,
    title,
    children,
  }: {
    onClick: () => void;
    "aria-label": string;
    title?: string;
    children: React.ReactNode;
  }) {
    const [pressed, setPressed] = React.useState(false);

    const base = [
      "relative inline-flex items-center justify-center select-none cursor-pointer touch-manipulation",
      // HITBOX stays stable – no transforms here
      "w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full",
      "bg-gradient-to-b from-[#fefefe] to-zinc-50 text-zinc-900",
      "ring-1 ring-inset ring-black/5",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(0,0,0,0.08)]",
      "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(0,0,0,0.12)]",
      "hover:ring-black/10",
      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40",
      "transition-shadow duration-200",
      "overflow-visible",
    ].join(" ");

    return (
      <button
        type="button"
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        className={base}
        onClick={onClick}
        onPointerDown={(e) => {
          if (e.button === 0) setPressed(true);
        }}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") setPressed(true);
        }}
        onKeyUp={() => setPressed(false)}
      >
        {/* Only this inner content scales; hitbox remains constant */}
        <span
          className={[
            "relative block w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9",
            "transition-transform duration-75 will-change-transform",
            pressed ? "scale-95" : "scale-100",
          ].join(" ")}
        >
          {children}
        </span>
      </button>
    );
  }

  const restartDisabled = !(hasCapture && !isDone);

  return (
    <footer className="w-full bg-transparent px-4 md:px-6 py-3">
      <div className="w-[90%] mx-auto">
        <div className="rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.12)] px-3 md:px-4 py-2 bg-[#f1f1f1]">
          <div className="grid grid-cols-[1fr_auto_minmax(0,1fr)] items-center gap-4">
            {/* LEFT: Soft reset; now JS-guarded, no native 'disabled' */}
            <div className="justify-self-start w-full min-w-0">
              <div className="w-full flex items-center justify-end pr-4">
                <SmallCircleButton
                  onClick={onReset}
                  aria-label="Try again"
                  title="Try again"
                  disabled={restartDisabled}
                >
                  {/* Inline restart SVG (inherits currentColor) */}
                  <svg viewBox="-7.5 0 32 32" aria-hidden className="w-full h-full" fill="currentColor">
                    <title>try-again</title>
                    <path d="M15.88 13.84c-1.68-3.48-5.44-5.24-9.040-4.6l0.96-1.8c0.24-0.4 0.080-0.92-0.32-1.12-0.4-0.24-0.92-0.080-1.12 0.32l-1.96 3.64c0 0-0.44 0.72 0.24 1.040l3.64 1.96c0.12 0.080 0.28 0.12 0.4 0.12 0.28 0 0.6-0.16 0.72-0.44 0.24-0.4 0.080-0.92-0.32-1.12l-1.88-1.040c2.84-0.48 5.8 0.96 7.12 3.68 1.6 3.32 0.2 7.32-3.12 8.88-1.6 0.76-3.4 0.88-5.080 0.28s-3.040-1.8-3.8-3.4c-0.76-1.6-0.88-3.4-0.28-5.080 0.16-0.44-0.080-0.92-0.52-1.080-0.4-0.080-0.88 0.16-1.040 0.6-0.72 2.12-0.6 4.36 0.36 6.36s2.64 3.52 4.76 4.28c0.92 0.32 1.84 0.48 2.76 0.48 1.24 0 2.48-0.28 3.6-0.84 4.16-2 5.92-7 3.92-11.12z" />
                  </svg>
                </SmallCircleButton>
              </div>
            </div>

            {/* CENTER: Confirm | Play/Pause | (Completion) Restart */}
            <div className="justify-self-center">
              {isDone ? (
                // Completion: ONLY a large Restart button
                <LargeCircleButton onClick={onRestart} aria-label="Restart" title="Restart">
                  <svg viewBox="-7.5 0 32 32" aria-hidden className="w-full h-full" fill="currentColor">
                    <title>restart</title>
                    <path d="M15.88 13.84c-1.68-3.48-5.44-5.24-9.040-4.6l0.96-1.8c0.24-0.4 0.080-0.92-0.32-1.12-0.4-0.24-0.92-0.080-1.12 0.32l-1.96 3.64c0 0-0.44 0.72 0.24 1.040l3.64 1.96c0.12 0.080 0.28 0.12 0.4 0.12 0.28 0 0.6-0.16 0.72-0.44 0.24-0.4 0.080-0.92-0.32-1.12l-1.88-1.040c2.84-0.48 5.8 0.96 7.12 3.68 1.6 3.32 0.2 7.32-3.12 8.88-1.6 0.76-3.4 0.88-5.080 0.28s-3.040-1.8-3.8-3.4c-0.76-1.6-0.88-3.4-0.28-5.080 0.16-0.44-0.080-0.92-0.52-1.080-0.4-0.080-0.88 0.16-1.040 0.6-0.72 2.12-0.6 4.36 0.36 6.36s2.64 3.52 4.76 4.28c0.92 0.32 1.84 0.48 2.76 0.48 1.24 0 2.48-0.28 3.6-0.84 4.16-2 5.92-7 3.92-11.12z" />
                  </svg>
                </LargeCircleButton>
              ) : hasCapture ? (
                // Confirm (primary, glowing)
                <button
                  type="button"
                  onClick={onConfirm}
                  aria-label="Confirm"
                  title="Confirm"
                  className={[
                    "relative inline-flex items-center justify-center select-none touch-manipulation",
                    "w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full",
                    "bg-gradient-to-b from-[#fefefe] to-zinc-50 text-zinc-900",
                    "ring-1 ring-inset ring-black/5",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_32px_rgba(16,185,129,0.22)]",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-400/40",
                    "transition-shadow duration-200",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-2 rounded-full blur transition-opacity duration-300 bg-green-400/25 opacity-100"
                  />
                  <span className="relative block w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9">
                    <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden>
                      <path d="M9 16.2L4.8 12l-1.4 1.4L9 19l12-12-1.4-1.4z" fill="currentColor" />
                    </svg>
                  </span>
                </button>
              ) : (
                <PlayPauseButton running={running} onToggle={onToggle} />
              )}
            </div>

            {/* RIGHT: status (no completion text), error */}
            <div className="justify-self-end w-full min-w-0 overflow-hidden">
              <div className="w-full flex items-center justify-end gap-x-3 flex-nowrap">
                {hasCapture && displayNote && !isDone && (
                  <div className="text-xs text-[#0f0f0f] truncate">
                    Ready: <span className="font-semibold">{displayNote}</span>
                  </div>
                )}
                {error ? (
                  <span className="px-2 py-1 rounded border border-red-300 bg-red-50 text-red-700 text-xs">
                    {error}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {/* no secondary row */}
        </div>
      </div>
    </footer>
  );
}
