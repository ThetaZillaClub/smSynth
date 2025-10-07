// components/landing/Hero.tsx
'use client';

import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import BeginJourneyButton from '@/components/header/BeginJourneyButton';

export default function Hero() {
  const scope = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const copyRef = useRef<HTMLParagraphElement | null>(null);
  const ctaRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.set([titleRef.current, copyRef.current, ctaRef.current], { opacity: 0, y: 24, willChange: 'transform, opacity' });
      gsap.timeline({ defaults: { duration: 0.8, ease: 'power3.out' } })
        .to(titleRef.current, { opacity: 1, y: 0 })
        .to(copyRef.current, { opacity: 1, y: 0 }, '-=0.4')
        .to(ctaRef.current, { opacity: 1, y: 0 }, '-=0.4');
    }, scope);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={scope}
      className="flex flex-col items-center justify-center text-center py-24 text-[#0f0f0f]
                 w-full bg-gradient-to-b from-[#f0f0f0] to-[#ebebeb]"
    >
      <h1 ref={titleRef} className="text-5xl md:text-7xl font-bold mb-4">Sing Smarter, Faster</h1>
      <p ref={copyRef} className="text-xl md:text-2xl mb-8 max-w-2xl">
        Build confident pitch, steady time, and dependable range with drills shaped to your singer profile. Minutes a day, real progress.
      </p>
      <div ref={ctaRef}>
        <BeginJourneyButton />
      </div>
    </div>
  );
}
