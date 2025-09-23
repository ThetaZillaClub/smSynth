// components/training/curriculum-layout/TransportCard/TransportCard.tsx
"use client";
import React from "react";
import TransportPanel from "./TransportPanel";
import type { SessionConfig } from "../../session/types";

type Props = Pick<SessionConfig, "bpm" | "ts" | "leadBars" | "restBars"> & {
  onChange: (patch: Partial<SessionConfig>) => void;
};

export default function TransportCard({
  bpm,
  ts,
  leadBars,
  restBars,
  onChange,
}: Props) {
  return (
    <TransportPanel
      bpm={bpm}
      ts={ts}
      leadBars={leadBars}
      restBars={restBars}
      onChange={onChange}
    />
  );
}
