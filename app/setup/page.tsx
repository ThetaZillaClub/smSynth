// app/setup/page.tsx
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { primeAudioOnce } from '@/lib/training/primeAudio';
import SetupLayout from '@/components/setup/setup-layout';
import AllSetupCard from '@/components/setup/card';

export default function SetupPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const qs = sp?.toString();
  const go = (href: string) => router.push(qs ? `${href}?${qs}` : href);

  const goRange = async () => {
    // Prime inside this click before routing (gesture-gated audio)
    await primeAudioOnce();
    go('/setup/range');
  };

  const items = [
    {
      key: 'range',
      title: 'Range',
      subtitle: 'One-time voice range capture',
      onClick: goRange,
    },
    {
      key: 'vision',
      title: 'Vision',
      subtitle: 'Camera + hand-beat calibration',
      onClick: () => go('/setup/vision'),
    },
  ];

  return (
    <SetupLayout
      title="Setup"
      subtitle="Run these once to capture range and calibrate vision."
    >
      <AllSetupCard items={items} />
    </SetupLayout>
  );
}
