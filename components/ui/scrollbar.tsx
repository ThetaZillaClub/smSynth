'use client';

import * as React from 'react';

type ScrollbarProps = {
  className?: string;
  style?: React.CSSProperties;
  /** Thumb color (default: #f7f7f7) */
  thumbColor?: string;
  /** Thumb color on hover/active (default: #fcfcfc) */
  thumbHoverColor?: string;
  /** Track color (default: subtle translucent) */
  trackColor?: string;
  /** Track color in dark mode (falls back to trackColor) */
  darkTrackColor?: string;
  /** Thickness in px (default 8) */
  thickness?: number;
  /** Corner radius in px (default 9999) */
  radius?: number;
  children: React.ReactNode;
};

/**
 * Drop-in scroll container with themed, native scrollbars.
 * Uses ::-webkit-scrollbar (Chromium/WebKit) and scrollbar-color (Firefox).
 */
export default function ScrollArea({
  className = '',
  style,
  thumbColor = '#f7f7f7',
  thumbHoverColor = '#fcfcfc',
  trackColor = 'rgba(15,15,15,0.08)',
  darkTrackColor,
  thickness = 8,
  radius = 9999,
  children,
}: ScrollbarProps) {
  const mergedStyle: React.CSSProperties = {
    ...style,
    ['--sb-thumb' as any]: thumbColor,
    ['--sb-thumb-hover' as any]: thumbHoverColor,
    ['--sb-track' as any]: trackColor,
    ['--sb-track-dark' as any]: darkTrackColor ?? trackColor,
    ['--sb-size' as any]: `${thickness}px`,
    ['--sb-radius' as any]: `${radius}px`,
  };

  return (
    <div className={`ui-scrollbar overflow-auto ${className}`} style={mergedStyle}>
      {children}
      <style jsx global>{`
        .ui-scrollbar {
          /* Only show the scrollbar when content exceeds; don't reserve space */
          /* Firefox */
          scrollbar-width: thin;
          scrollbar-color: var(--sb-thumb) var(--sb-track);
        }
        /* WebKit/Chromium */
        .ui-scrollbar::-webkit-scrollbar {
          width: var(--sb-size);
          height: var(--sb-size);
        }
        .ui-scrollbar::-webkit-scrollbar-track {
          background: var(--sb-track);
          border-radius: var(--sb-radius);
        }
        .ui-scrollbar::-webkit-scrollbar-thumb {
          background: var(--sb-thumb);
          border-radius: var(--sb-radius);
          border: 2px solid transparent; /* inset look */
          background-clip: content-box;
        }
        .ui-scrollbar:hover::-webkit-scrollbar-thumb,
        .ui-scrollbar:active::-webkit-scrollbar-thumb {
          background: var(--sb-thumb-hover);
        }
        html.dark .ui-scrollbar {
          scrollbar-color: var(--sb-thumb) var(--sb-track-dark);
        }
        html.dark .ui-scrollbar::-webkit-scrollbar-track {
          background: var(--sb-track-dark);
        }
      `}</style>
    </div>
  );
}
