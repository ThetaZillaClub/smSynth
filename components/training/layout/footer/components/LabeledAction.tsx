"use client";

import React from "react";
import ActionButton from "./ActionButton";
import type { FooterAction } from "../types";

/** Top label + action button */
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
      <div className="hidden lg:block text-[11px] lg:text-xs text-[#2d2d2d] leading-none">{topLabel}</div>
      <ActionButton {...action} />
    </div>
  );
}
