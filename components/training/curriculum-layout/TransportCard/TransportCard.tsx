// components/training/curriculum-layout/TransportCard/TransportCard.tsx
"use client";
import React from "react";
import TransportPanelControlled from "../../layout/transport/TransportPanelControlled";
import type { SessionConfig } from "../../layout/session/types";

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
    <TransportPanelControlled
      bpm={bpm}
      ts={ts}
      leadBars={leadBars}
      restBars={restBars}
      onChange={onChange}
    />
  );
}
