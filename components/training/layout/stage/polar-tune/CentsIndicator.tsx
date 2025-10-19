// components/training/layout/stage/polar-tune/CentsIndicator.tsx
'use client';
import * as React from 'react';
import { clamp } from './polar-helpers';

const BLUE_ACCENT = 'rgba(132, 179, 246, 0.35)';
const TEXT_BLUE = 'rgb(30, 64, 175)';
const TEXT_GREEN_NEAR = 'rgb(90, 198, 152)';
const TEXT_GREEN_SPOT = 'rgb(35, 215, 148)';

type Props = {
  /** live relative pitch class in [0,12), undefined when no signal */
  liveRel?: number;
  /** cents offset to target; negative = sing higher (↑), positive = sing lower (↓) */
  liveCents?: number;
  /** target semitone index (0..11) relative to tonic */
  targetRel: number;
  confidence?: number;
  confThreshold?: number;
  className?: string;
};

export default function CentsIndicator({
  liveRel,
  liveCents,
  targetRel,
  confidence = 0,
  confThreshold = 0.5,
  className,
}: Props) {
  const isLive = typeof liveRel === 'number' && typeof liveCents === 'number';

  // visual sizing
  const FONT_SIZE = 16;     // ↑ from 14
  const PAD_Y = 8;          // ↑ from 6
  const PAD_X = 16;         // ↑ from 12
  const MIN_W = 96;         // ↑ from 72
  // Reserve a fixed slot height (pill height + a little slack) to prevent bounce.
  const RESERVED_H = FONT_SIZE + PAD_Y * 2 + 8; // ~40px

  const absC = Math.round(Math.abs(liveCents ?? 0));
  const arrow = (liveCents ?? 0) < -3 ? '↑' : (liveCents ?? 0) > 3 ? '↓' : '•';
  const label = `${arrow} ${absC}¢`;

  const alpha = clamp(
    (confidence - confThreshold) / Math.max(0.001, 1 - confThreshold),
    0,
    1
  );

  const nearestIdx = (((Math.round(liveRel ?? -999)) % 12) + 12) % 12;
  const isCorrectNote = isLive && nearestIdx === (((targetRel % 12) + 12) % 12);
  const inTune = isLive ? Math.abs(liveCents!) <= 20 : false;

  let color = TEXT_BLUE;
  if (isCorrectNote) color = inTune ? TEXT_GREEN_SPOT : TEXT_GREEN_NEAR;
  const [r, g, b] = color.match(/\d+/g)!.map(Number);

  return (
    <div
      className={[
        // ↑ more gap than before (mt-4 instead of mt-3)
        'w-full flex justify-center mt-4 select-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      // Reserve vertical space regardless of visibility to prevent layout shift.
      style={{ height: RESERVED_H }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.9)',
          border: `1px solid ${BLUE_ACCENT}`,
          borderRadius: 9999,
          padding: `${PAD_Y}px ${PAD_X}px`,
          lineHeight: 1.2,
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          color: `rgba(${r},${g},${b},${alpha})`,
          fontWeight: 600,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system',
          fontSize: FONT_SIZE,
          minWidth: MIN_W,
          textAlign: 'center',
          // Hide/show without affecting layout:
          opacity: isLive ? 1 : 0,
          visibility: isLive ? 'visible' : 'hidden',
          transition: 'opacity 120ms ease-out',
        }}
        aria-live={isLive ? 'polite' : undefined}
        aria-hidden={isLive ? undefined : true}
      >
        {label}
      </div>
    </div>
  );
}
