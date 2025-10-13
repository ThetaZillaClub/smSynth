// components/home/HomeHeader.tsx
'use client';

import * as React from 'react';
import StudentImage from '@/components/student-home/StudentImage';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getImageUrlCached, getCurrentStudentRowCached } from '@/lib/client-cache';
import { STUDENT_IMAGE_HINT_KEY, pickAuthAvatarUrl } from '@/components/sidebar/types';

export default function HomeHeader({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const [imgUrl, setImgUrl] = React.useState<string | null>(avatarUrl ?? null);

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function resolveAndSet(userArg?: any) {
      if (cancelled) return;

      // Try current session if user not passed in
      let user = userArg;
      if (!user) {
        const { data: { session } } = await supabase.auth.getSession();
        user = session?.user ?? null;
      }

      if (!user) {
        // Don’t make this terminal; auth listener below will call us again.
        setImgUrl(null);
        return;
      }

      // Single shared cached fetch
      const row = await getCurrentStudentRowCached(supabase);

      // 1) localStorage hint → row.image_path
      let hintedPath: string | null = null;
      try { hintedPath = localStorage.getItem(STUDENT_IMAGE_HINT_KEY); } catch {}
      const imagePath = hintedPath || (row?.image_path ?? null);

      // 2) Resolve signed/public URL
      let resolved: string | null = null;
      if (imagePath) {
        try {
          resolved = await getImageUrlCached(supabase, imagePath);
          if (!hintedPath && row?.image_path) {
            try { localStorage.setItem(STUDENT_IMAGE_HINT_KEY, row.image_path); } catch {}
          }
        } catch { resolved = null; }
      }

      // 3) Fallback to provider avatar
      if (!resolved) resolved = pickAuthAvatarUrl(user) ?? null;

      if (!cancelled) setImgUrl(resolved);
    }

    // First attempt (don’t bail permanently if unauth’d)
    (async () => {
      // Give the session a short chance to appear, but not terminal if not ready
      await ensureSessionReady(supabase, 2500).catch(() => {});
      await resolveAndSet();
    })();

    // Re-run whenever auth changes (this fixes the “one-shot then bail” problem)
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      resolveAndSet(session?.user ?? null);
    });

    // If another tab/page updates the image hint path, refresh here too
    const onStorage = (e: StorageEvent) => {
      if (e.key === STUDENT_IMAGE_HINT_KEY) resolveAndSet();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const initial = (displayName?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 md:h-14 md:w-14 rounded-full overflow-hidden bg-[#f9f9f9] border border-[#d2d2d2] grid place-items-center">
          {imgUrl ? (
            <div className="w-full h-full">
              {/* (Optional) If you want zero inner fade like the sidebar, add `visible` */}
              <StudentImage imgUrl={imgUrl} alt={`${displayName} avatar`} />
            </div>
          ) : (
            <span className="text-base md:text-lg font-semibold text-[#373737] select-none">
              {initial}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Welcome back, {displayName}</h1>
        </div>
      </div>
    </header>
  );
}
