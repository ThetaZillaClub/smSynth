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
      const header = '.js-features-title';
      const cards = '.js-feature-card';
      gsap.set([header, cards], { opacity: 0, y: 24, willChange: 'transform, opacity' });
      gsap.timeline({ defaults: { duration: 0.6, ease: 'power3.out' }, delay: FEATURES_START_DELAY })
        .to(header, { opacity: 1, y: 0 })
        .to(cards, { opacity: 1, y: 0, stagger: 0.15 }, '-=0.2');
    }, scope);
    return () => ctx.revert();
  }, []);

  const features = [
    { title: 'Training', description: 'Train custom singing models with our gamified interface. Upload data, fine-tune, and create unique voices effortlessly.', image: '/placeholder-training.jpg' },
    { title: 'Model Library', description: 'Browse and use a vast collection of public singing models. Share your creations or keep them private.', image: '/placeholder-library.jpg' },
    { title: 'Prompt Conversion', description: "Convert raw audio to custom vocals using prompts. Transform any sound into your model's voice instantly.", image: '/placeholder-conversion.jpg' },
    { title: 'DAW Plugin', description: 'Integrate smSynth directly into your Digital Audio Workstation for seamless workflow in music production.', image: '/placeholder-plugin.jpg' },
  ];

  return (
    <section
      ref={scope}
      id="features"
      className="pt-24 pb-24 w-full flex flex-col items-center justify-center
                 bg-gradient-to-b from-[#ebebeb] to-[#dcdcdc] scroll-mt-20"
    >
      <h2 className="mx-auto text-center max-w-xl text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-16 js-features-title">
        Key Features
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl px-6">
        {features.map((feature, index) => (
          <div key={index} className="bg-[#ebebeb] border border-[#d2d2d2] rounded-lg p-6 shadow-md js-feature-card">
            <div className="bg-gray-300 h-48 w-full mb-4 rounded" />
            <h3 className="text-xl font-semibold mb-2 text-[#0f0f0f]">{feature.title}</h3>
            <p className="text-sm text-[#373737]">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
