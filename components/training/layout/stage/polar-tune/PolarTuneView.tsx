// components/training/layout/stage/polar-tune/PolarTuneView.tsx
'use client';
import * as React from 'react';
import {
  pcToSolfege,
  type ChromaticStyle,
  type CaseStyle,
  type SolfegeScaleName,
} from '@/utils/lyrics/solfege';
import { isInScale, type ScaleName } from '@/utils/phrase/scales';
import { pcLabelForKey } from '@/utils/pitch/enharmonics';
import { clamp } from './polar-helpers';
import PolarCenterBadge from './PolarCenterBadge';

type Props = {
  tonicPc: number;
  scaleName: SolfegeScaleName;
  activeRels?: number[];
  chromaticStyle?: ChromaticStyle;
  caseStyle?: CaseStyle;
  title?: string;
  className?: string;
  liveRel?: number;
  liveCents?: number;
  confidence?: number;
  confThreshold?: number;
  centerPrimary?: string;
  centerSecondary?: string;
  /** NEW: 0..1 progress to render as a green overlay ring on the center badge */
  centerProgress01?: number;
};

const TEXT_DARK = '#0f0f0f';
const TEXT_OFF  = '#6b7280';
const BORDER    = '#dcdcdc';

const BLUE_LIVE  = 'rgba(132, 179, 246, VAR_A)';
const GREEN_NEAR = 'rgba(90, 198, 152, VAR_A)';
const GREEN_SPOT = 'rgba(35, 215, 148, VAR_A)';

function solfegeLabelFor(
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
  centerPrimary,
  centerSecondary,
  centerProgress01, // NEW
}: Props) {
  const onScaleFlags = React.useMemo(() => {
    const flags = new Array(12).fill(false);
    for (let rel = 0; rel < 12; rel++) {
      const pcAbs = ((tonicPc + rel) % 12 + 12) % 12;
      flags[rel] = isInScale(pcAbs, tonicPc, (scaleName as unknown as ScaleName));
    }
    return flags;
  }, [tonicPc, scaleName]);

  const noteLabels = React.useMemo(
    () => Array.from({ length: 12 }, (_, rel) => {
      const pcAbs = ((tonicPc + rel) % 12 + 12) % 12;
      return pcLabelForKey(pcAbs, tonicPc, (scaleName as unknown as ScaleName));
    }),
    [tonicPc, scaleName]
  );

  const solfegeLabels = React.useMemo(
    () => Array.from({ length: 12 }, (_, rel) =>
      solfegeLabelFor(rel, tonicPc, scaleName, chromaticStyle, caseStyle)
    ),
    [tonicPc, scaleName, chromaticStyle, caseStyle]
  );

  const targetIdx = activeRels.length ? (((activeRels[0] % 12) + 12) % 12) : 0;

  const size = 260, cx = size / 2, cy = size / 2;
  const R = size * 0.48;
  const r = size * 0.28;

  const ringMinHeight = 0;

  const isLive = liveRel !== undefined;
  const alpha = isLive
    ? clamp((confidence - confThreshold) / Math.max(0.001, 1 - confThreshold), 0, 1)
    : 1;
  const inTune = isLive ? Math.abs(liveCents ?? 0) <= 20 : false;

  const gap = (Math.PI / 180) * 6;
  const sector = (2 * Math.PI - gap * 12) / 12;

  // tonic at 90°
  const START = -Math.PI / 2 - sector / 2;

  const heights = new Array(12).fill(0);
  if (isLive) {
    const tol = 20;
    const cents = liveCents ?? 0;
    const absC = Math.abs(cents);

    const low = Math.floor(liveRel!);
    const high = (low + 1) % 12;
    const frac = liveRel! - low;
    let wLow = 1 - frac;
    let wHigh = frac;

    const nearestIdx = (((Math.round(liveRel!)) % 12) + 12) % 12;

    const rawMask = clamp((absC - tol) / (100 - tol), 0, 1);
    const mask = Math.pow(rawMask, 1.2);

    if (nearestIdx === targetIdx) {
      if (low === targetIdx) wHigh *= mask;
      else if (high === targetIdx) wLow *= mask;
    }

    heights[((low % 12) + 12) % 12] = wLow;
    heights[((high % 12) + 12) % 12] = wHigh;
  }

  const LABEL_OUT_R = R - 8;
  const LABEL_IN_R  = R - 26;

  const labelPad = gap * 0.35;

  const arcPath = (radius: number, a0: number, a1: number) => {
    const x0 = cx + radius * Math.cos(a0),
          y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1),
          y1 = cy + radius * Math.sin(a1);
    const large = (a1 - a0) % (2 * Math.PI) > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
  };

  const CENTER_R = r * 0.5;
  const INNER_GAP_PX = Math.max(1.5, size * 0.008);
  const INNER_R_FIXED = CENTER_R + INNER_GAP_PX;

  const fallbackPrimary = solfegeLabelFor(0, tonicPc, scaleName, chromaticStyle, 'capital');
  const fallbackSecondary = 'tonic';

  return (
    <div
      className={['w-full flex flex-col items-center', className].filter(Boolean).join(' ')}
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
        aria-label="Chromatic steps (live) with note + solfege labels"
      >
        <defs>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.16" />
          </filter>

          {/* OUTER label arcs */}
          {Array.from({ length: 12 }, (_, i) => {
            const a0 = START + i * (sector + gap) + labelPad;
            const a1 = a0 + sector - 2 * labelPad;
            return (
              <path key={`lp-out-${i}`} id={`label-arc-out-${i}`} d={arcPath(LABEL_OUT_R, a0, a1)} fill="none" stroke="none" />
            );
          })}

          {/* INNER label arcs */}
          {Array.from({ length: 12 }, (_, i) => {
            const a0 = START + i * (sector + gap) + labelPad;
            const a1 = a0 + sector - 2 * labelPad;
            return (
              <path key={`lp-in-${i}`} id={`label-arc-in-${i}`} d={arcPath(LABEL_IN_R, a0, a1)} fill="none" stroke="none" />
            );
          })}
        </defs>

        <g filter="url(#softShadow)">
          {/* live overlay bands */}
          {Array.from({ length: 12 }, (_, i) => {
            const extH = heights[i];
            if (!(isLive && extH > ringMinHeight)) return <g key={i} />;

            const a0 = START + i * (sector + gap);
            const a1 = a0 + sector;

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
              ? inTune ? GREEN_SPOT : GREEN_NEAR
              : BLUE_LIVE;
            const extFill = colorTpl.replace('VAR_A', String(alpha.toFixed(3)));

            return <path key={i} d={d_ext} fill={extFill} stroke="none" />;
          })}

          {/* OUTER: enharmonic letters (small + italic) */}
          {Array.from({ length: 12 }, (_, i) => {
            const onScale = !!onScaleFlags[i];
            const fs = onScale ? 8 : 6;
            const fill = onScale ? TEXT_DARK : TEXT_OFF;
            const weight = onScale ? 600 : 500;
            return (
              <text key={`note-${i}`} fontSize={fs} fill={fill} fontWeight={weight} fontStyle="italic">
                <textPath href={`#label-arc-out-${i}`} startOffset="50%" dominantBaseline="middle" style={{ textAnchor: 'middle' }}>
                  {noteLabels[i]}
                </textPath>
              </text>
            );
          })}

          {/* INNER: solfege (bigger) */}
          {Array.from({ length: 12 }, (_, i) => {
            const onScale = !!onScaleFlags[i];
            const fs = onScale ? 12 : 9;
            const fill = onScale ? TEXT_DARK : TEXT_OFF;
            const weight = onScale ? 600 : 500;
            return (
              <text key={`solfege-${i}`} fontSize={fs} fill={fill} fontWeight={weight}>
                <textPath href={`#label-arc-in-${i}`} startOffset="50%" dominantBaseline="middle" style={{ textAnchor: 'middle' }}>
                  {solfegeLabels[i]}
                </textPath>
              </text>
            );
          })}

          {/* Center badge with optional progress ring */}
          <PolarCenterBadge
            cx={cx}
            cy={cy}
            r={CENTER_R}
            primary={centerPrimary ?? fallbackPrimary}
            secondary={centerSecondary ?? fallbackSecondary}
            progress01={centerProgress01}
          />
        </g>
      </svg>
    </div>
  );
}
