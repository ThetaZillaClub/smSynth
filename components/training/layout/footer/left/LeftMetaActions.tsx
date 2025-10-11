"use client";

import React from "react";
import ScaleMeta from "../meta/ScaleMeta";
import LabeledAction from "../actions/LabeledAction";
import LabeledTriadAction from "../actions/LabeledTriadAction";
import type { FooterAction } from "../types";
import type { ScaleName } from "@/utils/phrase/scales";

export default function LeftMetaActions({
  scaleName,
  keySig,
  tonicAction,
  arpAction,
  className,
}: {
  scaleName?: ScaleName | null;
  keySig?: string | null;
  tonicAction?: FooterAction; // Key
  arpAction?: FooterAction;   // Triad
  className?: string;
}) {
  return (
    <div
      className={[
        "w-full flex items-center justify-start flex-nowrap overflow-visible",
        // tighter gap for denser grouping
        "gap-x-3 md:gap-x-4",
        className ?? "",
      ].join(" ")}
    >
      {/* Order: Triad → Key → Scale */}
      {arpAction ? <LabeledTriadAction topLabel="Triad" action={arpAction} /> : null}
      {tonicAction ? <LabeledAction     topLabel="Key"   action={tonicAction} /> : null}
      <ScaleMeta className="w-[7rem] flex-none" scaleName={scaleName ?? null} keySig={keySig ?? null} />
    </div>
  );
}
