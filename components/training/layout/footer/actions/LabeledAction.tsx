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
    <div className={`flex flex-col items-center justify-center gap-1 min-w-[3.25rem] overflow-visible ${className ?? ""}`}>
      <div className="text-xs text-[#2d2d2d] leading-none">{topLabel}</div>
      <FooterActionButton {...action} />
    </div>
  );
}
