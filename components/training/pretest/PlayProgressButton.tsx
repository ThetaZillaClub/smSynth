"use client";

import React, { useMemo, useId } from "react";

type PlayProgressButtonProps = {
  /** 0..1 hold-progress. Ring fills accordingly. */
  progress: number;
  /** Called when the button is pressed (start / replay — your logic). */
  onToggle: () => void;
  /** Keep a persistent glow once complete (e.g., gate.passed). */
  complete?: boolean;
  /** Disable interaction. */
  disabled?: boolean;
  /** Pixel size of the button (outer diameter). */
  size?: number;
  /** Text shown inside the button (e.g., "C4" or "A4"). */
  label: string;
  /** Optional override for the accessible label (defaults to "Target {label}"). */
  ariaLabel?: string;
  /** Optional tooltip/title override (defaults to ariaLabel). */
  tooltip?: string;
};

export default function PlayProgressButton({
  progress,
  onToggle,
  complete,
  disabled,
  size = 72,
  label,
  ariaLabel,
  tooltip,
}: PlayProgressButtonProps) {
  const gid = useId();
  const pct = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const stroke = Math.max(4, Math.round(size * 0.085)); // slightly thicker looks great in green
  const r = size / 2 - stroke / 2; // ring kisses the edge
  const C = 2 * Math.PI * r;
  const dashOffset = C * (1 - pct);
  const isComplete = !!complete || pct >= 1;

  const base = [
    "relative inline-flex items-center justify-center",
    "rounded-full select-none",
    // Light surface + subtle depth (keeps the vibe of your footer button)
    "bg-gradient-to-b from-[#fefefe] to-zinc-50 text-zinc-900",
    "ring-1 ring-inset ring-black/5",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(0,0,0,0.08)]",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(0,0,0,0.12)]",
    "hover:ring-black/10",
    "active:scale-95",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40",
    "transition-all duration-200",
  ].join(" ");

  // A11y: expose progress semantics
  const aria = useMemo(
    () => ({
      role: "progressbar",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": Math.round(pct * 100),
      "aria-label": ariaLabel ?? `Target ${label}`,
    }),
    [pct, label, ariaLabel]
  );

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={tooltip ?? (ariaLabel ?? `Target ${label}`)}
      className={[
        base,
        isComplete
          ? "ring-1 ring-green-500/50 shadow-[0_0_0_6px_rgba(34,197,94,0.18),0_10px_34px_rgba(34,197,94,0.35)]"
          : "",
      ].join(" ")}
      style={{ width: size, height: size }}
      {...aria}
    >
      {/* Green glow turns on at 100% */}
      <span
        aria-hidden
        className={[
          "pointer-events-none absolute -inset-1 rounded-full blur transition-opacity duration-300",
          "bg-green-400/35",
          isComplete ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      {/* Circular progress ring (green) */}
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            {/* Tailwind green-500/600-ish */}
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>

        {/* Track (subtle green tint) */}
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(34,197,94,0.18)" strokeWidth={stroke} fill="none" />

        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} // start at 12 o’clock
        />
      </svg>

      {/* NOTE LABEL inside the button */}
      <span className="relative z-10 px-2 text-sm md:text-base font-semibold tracking-wide tabular-nums">
        {label}
      </span>
    </button>
  );
}
