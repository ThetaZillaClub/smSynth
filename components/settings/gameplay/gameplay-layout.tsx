// components/settings/gameplay/gameplay-layout.tsx
"use client";

import * as React from "react";
import KeyRow from "./key/KeyRow";           // ← NEW (first)
import SpeedRow from "./speed/SpeedRow";
import LeadRow from "./lead/LeadRow";
import OctaveRow from "./octave/OctaveRow";
import AutoplayRow from "./autoplay/AutoplayRow"; // ← NEW (last)

type Props = { baselineBpm?: number };

export default function GameplayLayout({ baselineBpm }: Props) {
  return (
    <div className="space-y-8">
      <KeyRow />
      <SpeedRow baselineBpm={baselineBpm} />
      <LeadRow />
      <OctaveRow />
      <AutoplayRow />
    </div>
  );
}
