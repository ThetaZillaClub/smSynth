// components/training/layout/footer/actions/FooterActionButton.tsx
"use client";

import React from "react";
import type { FooterAction } from "../types";

export default function FooterActionButton({ label, icon, onClick, disabled, title }: FooterAction) {
  const len = (label ?? "").length;

  const base = [
    "relative inline-flex items-center justify-center",
    "w-10 h-10 md:w-11 md:h-11 lg:w-12 lg:h-12 rounded-full",
    "bg-gradient-to-b from-[#fefefe] to-zinc-50 text-zinc-900",
    "ring-1 ring-inset ring-black/5",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(0,0,0,0.08)]",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(0,0,0,0.12)]",
    "hover:ring-black/10",
    "active:scale-95",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40",
    "transition-all duration-200",
    "overflow-visible",
    disabled ? "opacity-40 cursor-not-allowed" : "",
  ].join(" ");

  const textSize = len > 10 ? "text-[10px]" : "text-[11px] md:text-xs lg:text-sm";
  const aria = title ?? label ?? "Action";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={aria}
      aria-label={aria}
      className={base}
    >
      {icon ? (
        <span className="relative z-10 inline-flex items-center justify-center" aria-hidden>
          {icon}
        </span>
      ) : (
        <span className={`relative z-10 px-1 font-semibold tracking-tight tabular-nums ${textSize}`}>
          {label}
        </span>
      )}
    </button>
  );
}
