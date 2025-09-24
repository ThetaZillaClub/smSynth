'use client';

import Link from 'next/link';

type Props = {
  href: string;
  onPrime: () => void;
};

export default function StudentLaunchButton({ href, onPrime }: Props) {
  return (
    <Link
      href={href}
      prefetch
      className="px-4 py-2 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] text-[#0f0f0f] hover:bg-white transition"
      onMouseDown={onPrime}
      onTouchStart={onPrime}
      onAuxClick={onPrime}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onPrime();
      }}
    >
      Launch Training
    </Link>
  );
}
