'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RangeSetupRedirect() {
  const router = useRouter();
  useEffect(() => {
    try { localStorage.setItem('appmode:v2', JSON.stringify({ view: 'exercise', current: 'range-setup' })); } catch {}
    router.replace('/training');
  }, [router]);
  return null;
}
