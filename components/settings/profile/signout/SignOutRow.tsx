// components/settings/profile/signout/SignOutRow.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutRow() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const onSignOut = async () => {
    setErr(null);
    setLoading(true);
    try {
      await supabase.auth.signOut();
      try { localStorage.removeItem('ptp:studentImagePath'); } catch {}
      router.push('/auth/login');
    } catch (e: any) {
      setErr(e?.message || 'Failed to sign out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Single row: label + action */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[#0f0f0f] font-medium shrink-0">Sign Out</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSignOut}
            disabled={loading}
            aria-busy={loading}
            className={[
              // match ViewSelect inactive style with same hover to white
              'px-3 py-1.5 rounded-md text-sm',
              'bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2]',
              'hover:bg-white',
              // small QoL
              'disabled:opacity-60 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {loading ? 'Signing out…' : 'Log Out'}
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
