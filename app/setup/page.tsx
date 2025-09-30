'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

function setAndGo(id: string, push: (p: string) => void) {
  try { localStorage.setItem('appmode:v2', JSON.stringify({ view: 'exercise', current: id })); } catch {}
  push('/training');
}

export default function SetupPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <div className="px-6 pt-8 pb-10 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-[#0f0f0f]">Setup</h1>
        <p className="text-sm text-[#0f0f0f] mt-1">Run these once to capture range and calibrate vision.</p>

        <div className="mt-6 grid gap-4 grid-cols-1 sm:grid-cols-2">
          <button
            onClick={() => setAndGo('range-setup', router.push)}
            className="text-left rounded-xl bg-white border border-[#dcdcdc] p-5 hover:shadow-md active:scale-[0.99] transition"
          >
            <div className="text-xl font-semibold text-[#0f0f0f]">Range</div>
            <div className="text-sm text-[#0f0f0f] mt-1">One-time voice range capture</div>
            <div className="mt-3 inline-flex items-center gap-1 text-sm text-[#0f0f0f]">Open ↗</div>
          </button>

          <button
            onClick={() => setAndGo('vision-setup', router.push)}
            className="text-left rounded-xl bg-white border border-[#dcdcdc] p-5 hover:shadow-md active:scale-[0.99] transition"
          >
            <div className="text-xl font-semibold text-[#0f0f0f]">Vision</div>
            <div className="text-sm text-[#0f0f0f] mt-1">Camera + hand-beat calibration</div>
            <div className="mt-3 inline-flex items-center gap-1 text-sm text-[#0f0f0f]">Open ↗</div>
          </button>
        </div>
      </div>
    </div>
  );
}
