// components/landing/Features.tsx
'use client';

import { gsap } from 'gsap';
import { useLayoutEffect, useRef } from 'react';

export default function Features() {
  const scope = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const FEATURES_START_DELAY = 1.25;
    const ctx = gsap.context(() => {
      const cards = '.js-feature-card';
      gsap.set(cards, { opacity: 0, y: 24, willChange: 'transform, opacity' });
      gsap.timeline({ defaults: { duration: 0.6, ease: 'power3.out' }, delay: FEATURES_START_DELAY })
        .to(cards, { opacity: 1, y: 0, stagger: 0.15 });
    }, scope);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={scope}
      id="features"
      className="
        w-full py-24
        bg-gradient-to-b from-[#ebebeb] to-[#dcdcdc]
        flex flex-col items-center justify-center
        scroll-mt-20
      "
    >
      {/* Bento grid: two rows (6 cols on sm+) with taller cards */}
      <div
        className="
          grid w-full max-w-7xl px-6 gap-6
          sm:grid-cols-6
          [grid-auto-rows:minmax(360px,auto)]
          md:[grid-auto-rows:minmax(420px,auto)]
          lg:[grid-auto-rows:minmax(480px,auto)]
        "
      >
        {/* Row 1 */}
        <div className="js-feature-card rounded-2xl border border-[#d2d2d2] bg-[#fcfcfc] p-6 sm:col-span-4">
          <h3 className="text-xl font-semibold text-[#0f0f0f]">Smart Lesson Builder</h3>
          <p className="mt-3 text-sm text-[#373737] max-w-prose">
            Sessions match your range, goals, and time. Get the right notes at the right speed for steady wins.
          </p>
        </div>

        <div className="js-feature-card rounded-2xl border border-[#d2d2d2] bg-[#fcfcfc] p-6 sm:col-span-2">
          <h3 className="text-xl font-semibold text-[#0f0f0f]">Sheet & Piano Roll</h3>
          <p className="mt-3 text-sm text-[#373737] max-w-prose">
            Read staff or follow a grid. Switch views instantly to learn the way you like.
          </p>
        </div>

        {/* Row 2 */}
        <div className="js-feature-card rounded-2xl border border-[#d2d2d2] bg-[#fcfcfc] p-6 sm:col-span-3">
          <h3 className="text-xl font-semibold text-[#0f0f0f]">Rhythm Detection</h3>
          <p className="mt-3 text-sm text-[#373737] max-w-prose">
            Camera-based cues help you lock time with smooth, musical feel instead of a harsh click.
          </p>
        </div>

        <div className="js-feature-card rounded-2xl border border-[#d2d2d2] bg-[#fcfcfc] p-6 sm:col-span-3">
          <h3 className="text-xl font-semibold text-[#0f0f0f]">Precise Progress Reports</h3>
          <p className="mt-3 text-sm text-[#373737] max-w-prose">
            See pitch, timing, and range trends at a glance. Know exactly what to work on next.
          </p>
        </div>
      </div>
    </section>
  );
}
