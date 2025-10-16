// components/training/layout/footer/actions/LabeledAction.tsx
"use client";

import React from "react";
import FooterActionButton from "./FooterActionButton";
import type { FooterAction } from "../types";

export default function LabeledAction({
  topLabel,
  action,
  className,
}: {
  topLabel: string;
  action: FooterAction;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-0.5 md:gap-1 min-w-[2.75rem] overflow-visible ${className ?? ""}`}>
      {/* Show labels on larger screens only to reduce height earlier */}
      <div className="hidden lg:block text-[11px] lg:text-xs text-[#2d2d2d] leading-none">{topLabel}</div>
      <FooterActionButton {...action} />
    </div>
  );
}
