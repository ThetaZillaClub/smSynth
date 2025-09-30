'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VisionSetupRedirect() {
  const router = useRouter();
  useEffect(() => {
    try { localStorage.setItem('appmode:v2', JSON.stringify({ view: 'exercise', current: 'vision-setup' })); } catch {}
    router.replace('/training');
  }, [router]);
  return null;
}
