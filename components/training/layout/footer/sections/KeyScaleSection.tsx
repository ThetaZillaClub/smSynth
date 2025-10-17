"use client";

import React from "react";
import type { ScaleName } from "@/utils/phrase/scales";
import type { FooterAction } from "../types";

import LabeledAction from "../components/LabeledAction";
import ScaleReadout from "../readouts/ScaleReadout";
import MusicNotesIcon from "../icons/MusicNotesIcon";

/** Left cluster: Triad • Key • Scale */
export default function KeyScaleSection({
  scaleName,
  keySig,
  tonicAction,
  arpAction,
  className,
}: {
  scaleName: ScaleName | null;
  keySig: string | null;
  tonicAction?: FooterAction;
  arpAction?: FooterAction;
  className?: string;
}) {
  const triadAction: FooterAction | undefined = arpAction
    ? { ...arpAction, icon: arpAction.icon ?? <MusicNotesIcon /> }
    : undefined;

  return (
    <div
      className={[
        "w-full flex items-center justify-start flex-nowrap overflow-visible",
        "gap-x-3 md:gap-x-4",
        className ?? "",
      ].join(" ")}
    >
      {triadAction ? <LabeledAction topLabel="Triad" action={triadAction} /> : null}
      {tonicAction ? <LabeledAction topLabel="Key" action={tonicAction} /> : null}
      <ScaleReadout className="w-[7rem] flex-none" scaleName={scaleName} keySig={keySig} />
    </div>
  );
}
