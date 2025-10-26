// components/setup/range/stage/RangeCenterBadge.tsx
'use client';
import * as React from 'react';

const TEXT_DARK = '#0f0f0f';
const SUBTLE = '#4b5563';
const BORDER = '#dcdcdc';
const PROGRESS_GREEN = 'rgb(35, 215, 148)';

type Props = {
  cx: number;
  cy: number;
  r: number;
  primary: string;       // e.g., "C4" or "—"
  secondary?: string;    // optional small line
  /** 0..1 progress; clockwise from 12 o'clock */
  progress01?: number;
  /** ring/overlay thickness (default doubled vs game’s = 2) */
  strokeWidth?: number;
};

export default function RangeCenterBadge({
  cx,
  cy,
  r,
  primary,
  secondary,
  progress01 = 0,
  strokeWidth = 2, // doubled vs shared game badge
}: Props) {
  const p = Math.max(0, Math.min(1, progress01));
  const dash = 360 * p;
  const gap = 360 - dash;

  return (
    <g textRendering="geometricPrecision">
      {/* Base circular ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={BORDER}
        strokeWidth={strokeWidth}
        pathLength={360}
      />

      {/* Green sweep (progress) */}
      {p > 0 ? (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={PROGRESS_GREEN}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={360}
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          pointerEvents="none"
          aria-hidden
        />
      ) : null}

      {/* Perfectly centered primary label */}
      <text
        x={cx}
        y={cy}
        fontSize="14"
        textAnchor="middle"
        dominantBaseline="middle"
        alignmentBaseline="middle"
        fill={TEXT_DARK}
        fontWeight={600}
      >
        {primary}
      </text>

      {/* Optional secondary, positioned *below* the centered primary */}
      {secondary ? (
        <text
          x={cx}
          y={cy}
          dy="1.3em"
          fontSize="11"
          textAnchor="middle"
          dominantBaseline="hanging"
          fill={SUBTLE}
        >
          {secondary}
        </text>
      ) : null}
    </g>
  );
}
