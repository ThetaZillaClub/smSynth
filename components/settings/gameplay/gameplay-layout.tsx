// components/settings/gameplay/gameplay-layout.tsx
"use client";

import * as React from "react";
import KeyRow from "./key/KeyRow";
import SpeedRow from "./speed/SpeedRow";
import ViewRow from "./view/ViewRow";            // ← NEW
import LeadRow from "./lead/LeadRow";
import OctaveRow from "./octave/OctaveRow";
import AutoplayRow from "./autoplay/AutoplayRow";

type Props = { baselineBpm?: number };

export default function GameplayLayout({ baselineBpm }: Props) {
  return (
    <div className="space-y-8">
      <KeyRow />
      <SpeedRow baselineBpm={baselineBpm} />
      <ViewRow />                               {/* ← NEW: between Speed and Lead */}
      <LeadRow />
      <OctaveRow />
      <AutoplayRow />
    </div>
  );
}
