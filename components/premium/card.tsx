// components/premium/card.tsx
'use client';

import * as React from 'react';

export type PremiumItem = {
  key: string;
  title: string;
  subtitle?: string;
  onClick: () => void | Promise<void>;
  bg?: '#eeeeee' | '#f2f2f2';
};

export default function PremiumCard({ items }: { items: PremiumItem[] }) {
  return (
    <div>
      {/* match all-courses grid: earlier column bumps + tighter gaps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
        {items.map((item) => {
          const bgClass =
            item.bg === '#eeeeee'
              ? 'bg-[#eeeeee]'
              : item.bg === '#f2f2f2'
              ? 'bg-[#f2f2f2]'
              : 'bg-[#f2f2f2]';

          return (
            <button
              key={item.key}
              onClick={item.onClick}
              className={[
                'group text-left rounded-xl',
                bgClass,
                'border border-[#dcdcdc]',
                'aspect-[2/3] min-h-[220px]',
                'p-4 md:p-5 flex flex-col items-start justify-between',
                'hover:shadow-md shadow-sm active:scale-[0.99] transition',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]',
              ].join(' ')}
            >
              <div>
                <div className="text-lg md:text-xl font-semibold text-[#0f0f0f]">
                  {item.title}
                </div>
                {item.subtitle && (
                  <div className="text-xs md:text-sm text-[#373737] mt-1">
                    {item.subtitle}
                  </div>
                )}
              </div>
              {/* no inline CTA; rely on card hover/active styles */}
            </button>
          );
        })}
      </div>
    </div>
  );
}
