// components/faq/FaqSection.tsx
'use client';

import { FC, useState, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';

export interface FaqItem { question: string; answer: string; }
interface FaqSectionProps { className?: string; }

const FaqAccordionItem: FC<FaqItem> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div
      className="w-full bg-[#d7d7d7]/5 rounded-lg p-4 transition-[background-color] duration-300 cursor-pointer js-faq-item"
      role="button" tabIndex={0} aria-expanded={isOpen}
      onClick={() => setIsOpen(!isOpen)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); } }}
    >
      <div className="font-semibold text-[#0f0f0f] flex justify-between items-center gap-4">
        {question}
        <div className={`flex-shrink-0 rounded-full p-1 h-8 w-8 flex items-center justify-center bg-[#2d2d2d]/10 transition-transform duration-300 ease-in-out ${isOpen ? 'rotate-90' : 'rotate-0'}`} aria-hidden="true">
          <svg className="h-6 w-6 text-[#0f0f0f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`origin-center transition-transform duration-300 ease-in-out ${isOpen ? '-rotate-90' : 'rotate-0'}`} />
            <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`origin-center transition-transform duration-300 ease-in-out ${isOpen ? 'scale-y-0' : 'scale-y-100'}`} />
          </svg>
        </div>
      </div>

      <div className={`transition-[grid-template-rows] duration-300 ease-in-out grid ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`} aria-hidden={!isOpen}>
        <div className={`overflow-hidden transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
          <p className="mt-3 text-sm leading-relaxed text-[#0f0f0f]">{answer}</p>
        </div>
      </div>
    </div>
  );
};

export default function FaqSection({ className = '' }: FaqSectionProps) {
  const scope = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const FAQ_START_DELAY = 2.5;
    const ctx = gsap.context(() => {
      const title = '.js-faq-title';
      const items = '.js-faq-item';
      gsap.set([title, items], { opacity: 0, y: 20, willChange: 'transform, opacity' });
      gsap.timeline({ defaults: { duration: 0.6, ease: 'power3.out' }, delay: FAQ_START_DELAY })
        .to(title, { opacity: 1, y: 0 })
        .to(items, { opacity: 1, y: 0, stagger: 0.12 }, '-=0.2');
    }, scope);
    return () => ctx.revert();
  }, []);

  const faqItems: FaqItem[] = [
    { question: 'What is this?', answer: 'A game-like vocal trainer that builds pitch accuracy, timing, and usable range. Friendly, low pressure, and effective.' },
    { question: 'How does it personalize?', answer: 'You set your singer profile with range and goals. We choose keys, speeds, and difficulty that fit you and adjust as you improve.' },
    { question: 'What will I practice?', answer: 'Short call-and-response lines, target notes, and music-space timing drills that use timed playback and visual guides to tighten feel.' },
    { question: 'How long are sessions?', answer: '3 to 10 minutes. Quick wins you can stack, perfect between classes, rehearsals, or recording takes.' },
    { question: 'Do I need special gear?', answer: 'No. Your laptop mic works. Headphones help with pitch and timing feedback, but they are optional.' },
    { question: 'Beginner or pro?', answer: 'Both. It starts simple and scales to faster tempos, odd meters, wider intervals, and higher accuracy targets.' },
    { question: 'How do I track progress?', answer: 'Scorecards, streaks, and trends show your growth. You get clear next steps for what to practice tomorrow.' },
    { question: 'Can I practice rhythm without a click?', answer: 'Yes. Music-space timing blends visual pulses with timed playback so you lock the groove without a harsh beep.' },
  ];

  return (
    <section
      ref={scope}
      className={`w-full py-24 bg-gradient-to-b from-[#dcdcdc] to-[#d7d7d7] ${className}`}
    >
      <div className="max-w-2xl w-full mx-auto text-left text-[#0f0f0f] px-6">
        <h2 className="text-3xl font-bold text-center js-faq-title">FAQs</h2>
        <div className="mt-6 space-y-4">
          {faqItems.map(({ question, answer }, idx) => (
            <FaqAccordionItem key={idx} question={question} answer={answer} />
          ))}
        </div>
      </div>
    </section>
  );
}
