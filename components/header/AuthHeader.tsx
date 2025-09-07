'use client';
import type { FC, JSX } from 'react';
import Link from 'next/link';

const AuthHeader: FC = (): JSX.Element => (
  <header
    className="
      /* layout */
      fixed inset-x-0 top-0 z-20 h-20
      px-2 sm:px-4 md:px-8 lg:px-16
      grid grid-cols-3 items-center
      /* glass effect */
      backdrop-blur-sm
      backdrop-saturate-50
      /* use theme surface colours @ 40 % so “primary” links pop */
      bg-[#f0f0f0]/20
      /* no-blur fallback */
      supports-[not(backdrop-filter)]:bg-[#d7d7d7]/95
    "
  >
    {/* ───────── Column 1 – Brand ───────── */}
    <div className="justify-self-start">
      <Link
        href="/"
        className="
          text-xl sm:text-2xl md:text-3xl font-semibold
          text-[#0f0f0f]
        "
      >
        smSynth
      </Link>
    </div>
    {/* ───────── Column 2 – (empty) ───────── */}
    <div className="justify-self-center"></div>
    {/* ───────── Column 3 – (empty, no theme toggle) ───────── */}
    <div className="justify-self-end">
    </div>
  </header>
);
export default AuthHeader;