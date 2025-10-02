// app/premium/page.tsx
'use client';

import * as React from 'react';
import PremiumCard, { PremiumItem } from '@/components/premium/card';

type BillingPeriod = 'monthly' | 'annual';

export default function PremiumPage() {
  const [period, setPeriod] = React.useState<BillingPeriod>('monthly');

  // Plans: Premium & Pro. Backgrounds per request.
  const items: PremiumItem[] = [
    { key: 'premium', title: 'Premium', subtitle: 'Coming soon', onClick: () => {}, bg: '#eeeeee' },
    { key: 'pro',      title: 'Pro',      subtitle: 'Coming soon', onClick: () => {}, bg: '#f2f2f2' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      {/* Center everything in the viewport */}
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-3xl">
          {/* Tabs pinned to the LEFT edge of the grid / leftmost card */}
          <div className="mb-4 md:mb-6">
            <div className="flex gap-2" role="tablist" aria-label="Billing period">
              {(['monthly', 'annual'] as const).map((p) => {
                const active = period === p;
                return (
                  <button
                    key={p}
                    role="tab"
                    aria-selected={active}
                    aria-controls={`plans-${p}`}
                    onClick={() => setPeriod(p)}
                    className={
                      active
                        ? 'px-3 py-1.5 rounded-md bg-white border border-[#d2d2d2] text-sm'
                        : 'px-3 py-1.5 rounded-md text-sm bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2] hover:bg-white'
                    }
                  >
                    {p === 'monthly' ? 'Monthly' : 'Annual'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plans grid (same gaps as all-courses/setup) */}
          <div id={`plans-${period}`}>
            <PremiumCard items={items} />
          </div>
        </div>
      </div>
    </div>
  );
}
