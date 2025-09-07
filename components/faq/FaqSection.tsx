'use client'
import { FC, useState } from 'react'

export interface FaqItem {
  /** Shown inside the accordion header. */
  question: string;
  /** Rendered inside the collapsible content. */
  answer: string;
}

interface FaqSectionProps {
  className?: string;
}

const FaqAccordionItem: FC<FaqItem> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div
      className="
        w-full
        bg-[#d7d7d7]/5
        rounded-lg p-4
        transition-[background-color] duration-300 cursor-pointer
      "
      role="button"
      tabIndex={0}
      aria-expanded={isOpen}
      onClick={() => setIsOpen(!isOpen)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setIsOpen(!isOpen)
        }
      }}
    >
      <div
        className="
          font-semibold
          text-[#0f0f0f]
          flex justify-between items-center gap-4
        "
      >
        {question}
        {/* Icon wrapper: rotates 90deg when open */}
        <div
          className={`
            flex-shrink-0 rounded-full p-1 h-8 w-8
            flex items-center justify-center
            bg-[#2d2d2d]/10
            transition-transform duration-300 ease-in-out
            ${isOpen ? 'rotate-90' : 'rotate-0'}
          `}
          aria-hidden="true"
        >
          {/* Single SVG: minus is the horizontal line, vertical line scales away */}
          <svg
            className="h-6 w-6 text-[#0f0f0f]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
          <path
            d="M5 12H19"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className={`
              origin-center
              transition-transform duration-300 ease-in-out
              ${isOpen ? '-rotate-90' : 'rotate-0'}
            `}
          />
            <path
              d="M12 5V19"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className={`
                origin-center
                transition-transform duration-300 ease-in-out
                ${isOpen ? 'scale-y-0' : 'scale-y-100'}
              `}
            />
          </svg>
        </div>
      </div>
      {/* Content transition: height (via CSS grid trick) + opacity */}
      <div
        className={`
          transition-[grid-template-rows] duration-300 ease-in-out
          grid ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}
        `}
        aria-hidden={!isOpen}
      >
        <div
          className={`
            overflow-hidden
            transition-opacity duration-300 ease-in-out
            ${isOpen ? 'opacity-100' : 'opacity-0'}
          `}
        >
          <p
            className="
              mt-3 text-sm leading-relaxed
              text-[#0f0f0f]
            "
          >
            {answer}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function FaqSection({ className = '' }: FaqSectionProps) {
  const faqItems = [
    { question: "What is smSynth?", answer: "smSynth is a gamified app that allows users to train custom singing models and convert raw audio into vocals using prompts, creating copyright-free voices." },
    { question: "How do I start training a model?", answer: "Sign up for an account, upload your audio data, and follow the guided steps to finetune your model in a fun, interactive way." },
    { question: "Is smSynth free to use?", answer: "We offer a free tier with basic features. Premium subscriptions unlock advanced training options and unlimited model creation." },
    { question: "Can I share my models?", answer: "Yes, you can make your models public or keep them private. Public models contribute to our growing hub of singing voices." },
    { question: "What makes smSynth unique?", answer: "Our gamified approach makes model training engaging, and all models are ensured to be copyright-free through our platform." }
  ];
  return (
    /* ─────────────── FAQs ─────────────── */
    <section
      className={`
        max-w-2xl w-full
        text-left text-[#0f0f0f]
        ${className}
      `}
    >
      <h2 className="text-3xl font-bold text-center">FAQs</h2>
      <div className="mt-6 space-y-4">
        {faqItems.map(({ question, answer }, idx) => (
          <FaqAccordionItem key={idx} question={question} answer={answer} />
        ))}
      </div>
    </section>
  );
}