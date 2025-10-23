'use client';

import * as React from 'react';

export default function CTAGroup({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  return (
    <div className="px-2 mt-4">
      <button
        type="button"
        onClick={onSignup}
        className="w-full inline-flex justify-center items-center gap-2 rounded-md border border-[#d2d2d2] bg-gradient-to-b from-white to-[#f7f7f7] px-3 py-2 text-sm font-medium text-[#0f0f0f] transition active:scale-[0.98] hover:shadow-sm"
      >
        Sign Up
      </button>
      <button
        type="button"
        onClick={onLogin}
        className="mt-2 w-full inline-flex justify-center items-center gap-2 rounded-md border border-[#d2d2d2] bg-[#f5f5f5] px-3 py-2 text-sm font-medium text-[#0f0f0f] transition active:scale-[0.98] hover:bg-white"
      >
        Sign In
      </button>
    </div>
  );
}
