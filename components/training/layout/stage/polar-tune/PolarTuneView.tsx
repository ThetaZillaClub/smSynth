// components/training/layout/stage/polar-tune/PolarTuneView.tsx
'use client';
import * as React from 'react';
import {
  pcToSolfege,
  type ChromaticStyle,
  type CaseStyle,
  type SolfegeScaleName,
} from '@/utils/lyrics/solfege';
import { clamp } from './polar-helpers';

type Props = {
  tonicPc: number;
  scaleName: SolfegeScaleName;
  activeRels?: number[]; // first rel is the target semitone
  chromaticStyle?: ChromaticStyle;
  caseStyle?: CaseStyle;
  title?: string;
  className?: string;
  liveRel?: number;
  liveCents?: number;
  confidence?: number;
  confThreshold?: number;
};

/** Palette */
const TEXT_DARK = '#0f0f0f';
const BORDER = '#dcdcdc';

// live overlay fills
const BLUE_LIVE = 'rgba(132, 179, 246, VAR_A)';
const GREEN_NEAR = 'rgba(90, 198, 152, VAR_A)'; // correct note
const GREEN_SPOT = 'rgba(35, 215, 148, VAR_A)'; // correct & spot-on

function labelFor(
  rel: number,
  tonicPc: number,
  scaleName: SolfegeScaleName,
  chromaticStyle: ChromaticStyle,
  caseStyle: CaseStyle,
) {
  const pcAbs = ((tonicPc + rel) % 12 + 12) % 12;
  return pcToSolfege(pcAbs, tonicPc, scaleName, { chromaticStyle, caseStyle });
}

export default function PolarTuneView({
  tonicPc,
  scaleName,
  activeRels = [],
  chromaticStyle = 'auto',
  caseStyle = 'lower',
  title,
  className,
  liveRel,
  liveCents,
  confidence = 0,
  confThreshold = 0.5,
}: Props) {
  const labels = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        labelFor(i, tonicPc, scaleName, chromaticStyle, caseStyle),
      ),
    [tonicPc, scaleName, chromaticStyle, caseStyle],
  );

  const targetIdx = activeRels.length ? (((activeRels[0] % 12) + 12) % 12) : 0;

  // geometry
  const size = 260,
    cx = size / 2,
    cy = size / 2;
  const R = size * 0.48; // outer ring
  const r = size * 0.28; // inner ring (wedge inner radius)

  // Only render live overlays (no baseline wedges)
  const ringMinHeight = 0;

  // live signal
  const isLive = liveRel !== undefined;
  const alpha = isLive
    ? clamp(
        (confidence - confThreshold) / Math.max(0.001, 1 - confThreshold),
        0,
        1,
      )
    : 1;
  const inTune = isLive ? Math.abs(liveCents ?? 0) <= 20 : false;

  // —— Tolerance-masked crossfade (keeps target non-sticky) + optional softer onset
  const heights = new Array(12).fill(0);
  if (isLive) {
    const tol = 20; // cents window for "green"
    const cents = liveCents ?? 0;
    const absC = Math.abs(cents);

    // base crossfade (smooth like before)
    const low = Math.floor(liveRel!);
    const high = (low + 1) % 12;
    const frac = liveRel! - low;
    let wLow = 1 - frac;
    let wHigh = frac;

    const nearestIdx = (((Math.round(liveRel!)) % 12) + 12) % 12;

    // mask the off wedge inside tolerance; fade in beyond tol
    const rawMask = clamp((absC - tol) / (100 - tol), 0, 1);
    const ease = (t: number) => Math.pow(t, 1.2); // softer onset
    const mask = ease(rawMask);

    if (nearestIdx === targetIdx) {
      if (low === targetIdx) {
        wHigh *= mask; // off is 'high' → suppressed inside tol, fades in after
      } else if (high === targetIdx) {
        wLow *= mask; // off is 'low'
      }
      // the target weight (wLow or wHigh) remains as crossfade → not sticky
    }

    heights[((low % 12) + 12) % 12] = wLow;
    heights[((high % 12) + 12) % 12] = wHigh;
  }

  const gap = (Math.PI / 180) * 6;
  const sector = (2 * Math.PI - gap * 12) / 12;

  // curved label paths (no extra label ring)
  const LABEL_R = (R + r) / 2 + 10;
  const labelPad = gap * 0.35;
  const arcPath = (radius: number, a0: number, a1: number) => {
    const x0 = cx + radius * Math.cos(a0),
      y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1),
      y1 = cy + radius * Math.sin(a1);
    const large = (a1 - a0) % (2 * Math.PI) > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
  };

  // Live bands nearly touch the center circle
  const CENTER_R = r * 0.5; // center circle radius
  const INNER_GAP_PX = Math.max(1.5, size * 0.008); // tiny visible gap (~2px)
  const INNER_R_FIXED = CENTER_R + INNER_GAP_PX;

  return (
    <div
      className={['w-full flex flex-col items-center', className]
        .filter(Boolean)
        .join(' ')}
    >
      {title ? (
        <div className="mb-2 text-sm font-medium text-[#0f0f0f]/80">
          {title}
        </div>
      ) : null}

      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Chromatic steps (live)"
      >
        <defs>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.16" />
          </filter>

          {/* label paths */}
          {Array.from({ length: 12 }, (_, i) => {
            const a0 = -Math.PI / 2 + i * (sector + gap) + labelPad;
            const a1 = a0 + sector - 2 * labelPad;
            return (
              <path
                key={`lp-${i}`}
                id={`label-arc-${i}`}
                d={arcPath(LABEL_R, a0, a1)}
                fill="none"
                stroke="none"
              />
            );
          })}
        </defs>

        <g filter="url(#softShadow)">
          {/* live overlay bands only */}
          {Array.from({ length: 12 }, (_, i) => {
            const extH = heights[i];
            if (!(isLive && extH > ringMinHeight)) return <g key={i} />;

            const a0 = -Math.PI / 2 + i * (sector + gap);
            const a1 = a0 + sector;

            // KEY: grow from inner edge so area starts at 0
            const innerR = INNER_R_FIXED;
            const Re = innerR + (R - innerR) * extH;

            const xo0e = cx + Re * Math.cos(a0);
            const yo0e = cy + Re * Math.sin(a0);
            const xo1e = cx + Re * Math.cos(a1);
            const yo1e = cy + Re * Math.sin(a1);

            const xi0e = cx + innerR * Math.cos(a0);
            const yi0e = cy + innerR * Math.sin(a0);
            const xi1e = cx + innerR * Math.cos(a1);
            const yi1e = cy + innerR * Math.sin(a1);

            const d_ext = `M ${xo0e} ${yo0e} A ${Re} ${Re} 0 0 1 ${xo1e} ${yo1e} L ${xi1e} ${yi1e} A ${innerR} ${innerR} 0 0 0 ${xi0e} ${yi0e} Z`;

            const isTargetWedge = i === targetIdx;
            const colorTpl = isTargetWedge
              ? inTune
                ? GREEN_SPOT
                : GREEN_NEAR
              : BLUE_LIVE;
            const extFill = colorTpl.replace('VAR_A', String(alpha.toFixed(3)));

            return <path key={i} d={d_ext} fill={extFill} stroke="none" />;
          })}

          {/* curved labels */}
          {Array.from({ length: 12 }, (_, i) => (
            <text key={`label-${i}`} fontSize="12" fill={TEXT_DARK}>
              <textPath
                href={`#label-arc-${i}`}
                startOffset="50%"
                dominantBaseline="middle"
                style={{ textAnchor: 'middle', fontWeight: 600 }}
              >
                {labels[i]}
              </textPath>
            </text>
          ))}

          {/* center circle: transparent fill, #dcdcdc border */}
          <circle cx={cx} cy={cy} r={CENTER_R} fill="none" stroke={BORDER} />
          <text
            x={cx}
            y={cy - 6}
            fontSize="14"
            textAnchor="middle"
            fill={TEXT_DARK}
            fontWeight={600}
          >
            {labelFor(0, tonicPc, scaleName, chromaticStyle, 'capital')}
          </text>
          <text
            x={cx}
            y={cy + 12}
            fontSize="11"
            textAnchor="middle"
            fill="#4b5563"
          >
            tonic
          </text>
        </g>
      </svg>
    </div>
  );
}
