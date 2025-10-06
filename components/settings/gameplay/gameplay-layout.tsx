// components/settings/gameplay/gameplay-layout.tsx
'use client';

import * as React from 'react';
import SpeedRow from './speed/SpeedRow';

type Props = {
  /** Optional: pass a baseline BPM to preview the effective BPM next to the slider. */
  baselineBpm?: number;
};

export default function GameplayLayout({ baselineBpm }: Props) {
  return (
    <div className="space-y-8">
      <SpeedRow baselineBpm={baselineBpm} />
    </div>
  );
}
