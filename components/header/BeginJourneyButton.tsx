/* ────────────────────────────────────────────────────────────────
   File: src/components/header/BeginJourneyButton.tsx
   Desc: Call-to-action button – tokenised colours + dark mode.
───────────────────────────────────────────────────────────────── */
import type { FC, JSX } from 'react';
import Link from 'next/link';
const BeginJourneyButton: FC = (): JSX.Element => (
  <div className="relative group">
    <Link
      href="/auth/sign-up"
      className="
        /* base */
        relative inline-block w-fit p-px rounded-2xl
        font-semibold leading-6 whitespace-nowrap select-none
        text-[#f0f0f0]
        bg-[#323232]
        shadow-2xl shadow-[#0f0f0f]/60
        transition-all duration-300 ease-in-out
        hover:scale-105 active:scale-95
        hover:shadow-[#2d2d2d]/60
      "
    >
      {/* outer glow on hover */}
      <span
        className="
          absolute inset-0 rounded-2xl
          bg-gradient-to-r from-gray-100 via-zinc-100 to-gray-100
          p-[2px] opacity-0
          transition-opacity duration-500
          group-hover:opacity-100
        "
      />
      {/* inner content */}
      <span
        className="
          relative z-10 block
          px-1 sm:px-2 md:px-2 /* responsive padding */
          py-2 rounded-2xl
          bg-[#0f0f0f]
          ring-1 ring-inset
          ring-[#d2d2d2]
        "
      >
        <span className="relative z-10 flex flex-nowrap items-center space-x-1">
          <span className="transition-all duration-500">
            Start For Free
          </span>
          {/* Tight play icon (reduced perceived padding + responsive size) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 18 18"
            aria-hidden="true"
            focusable="false"
            className="flex-none w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 transition-all duration-500"
          >
            <path d="M6 4l9 5-9 5V4z" fill="currentColor" />
          </svg>
        </span>
      </span>
    </Link>
  </div>
);
export default BeginJourneyButton;