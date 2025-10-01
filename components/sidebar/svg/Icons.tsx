'use client';
import * as React from 'react';

export const CoursesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden className="w-6 h-6" {...props}>
    <path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h12v2H3z" fill="currentColor" />
  </svg>
);

export const SetupIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden className="w-6 h-6" {...props}>
    <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.94 3a7.948 7.948 0 00-.46-1.11l2.12-2.12-2.12-2.12-2.12 2.12c-.35-.2-.72-.37-1.11-.5L16 2h-4l-.35 3.16c-.39.12-.76.29-1.11.5L8.42 3.54 6.3 5.66l2.12 2.12c-.2.35-.37.72-.5 1.11L5 8v4l3.16.35c.12.39.29.76.5 1.11L6.3 15.58l2.12 2.12 2.12-2.12c-.2-.35.37-.72.5-1.11L23 12v-1z" fill="currentColor"/>
  </svg>
);

export const PremiumIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden className="w-6 h-6" {...props}>
    <path d="M12 2l3 7h7l-5.5 4.1L18 22l-6-3.8L6 22l1.5-8.9L2 9h7z" fill="currentColor" />
  </svg>
);

export const ChevronRightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden className="w-6 h-6" {...props}>
    <path d="M9 6l6 6-6 6" fill="currentColor" />
  </svg>
);
