// components/training/layout/stage/polar-tune/PolarCenterBadge.tsx
'use client';
import * as React from 'react';

const TEXT_DARK = '#0f0f0f';
const SUBTLE = '#4b5563';
const BORDER = '#dcdcdc';
const PROGRESS_GREEN = 'rgb(35, 215, 148)';

// Slim ring for both base + overlay so the green traces exactly.
const RING_STROKE_WIDTH = 1;

type Props = {
  cx: number;
  cy: number;
  r: number;
  primary: string;    // e.g., "Do"
  secondary?: string; // e.g., "Bb2"
  /** 0..1 progress of the current take; fills clockwise from 12 o'clock */
  progress01?: number;
};

export default function PolarCenterBadge({
  cx,
  cy,
  r,
  primary,
  secondary,
  progress01 = 0,
}: Props) {
  const p = Math.max(0, Math.min(1, progress01));
  const dash = 360 * p;
  const gap = 360 - dash;

  return (
    <g>
      {/* Base circular stroke the overlay traces exactly */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={BORDER}
        strokeWidth={RING_STROKE_WIDTH}
        pathLength={360}
      />

      {/* Green sweep that draws clockwise from 12 o'clock */}
      {p > 0 ? (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={PROGRESS_GREEN}
          strokeWidth={RING_STROKE_WIDTH}
          strokeLinecap="round"
          pathLength={360}
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${cx} ${cy})`} // start at 12 o'clock
          pointerEvents="none"
          aria-hidden
        />
      ) : null}

      <text
        x={cx}
        y={cy - 6}
        fontSize="14"
        textAnchor="middle"
        fill={TEXT_DARK}
        fontWeight={600}
      >
        {primary}
      </text>
      {secondary ? (
        <text
          x={cx}
          y={cy + 12}
          fontSize="11"
          textAnchor="middle"
          fill={SUBTLE}
        >
          {secondary}
        </text>
      ) : null}
    </g>
  );
}
