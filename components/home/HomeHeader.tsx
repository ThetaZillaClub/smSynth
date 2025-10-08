// components/home/HomeHeader.tsx
'use client';

import * as React from 'react';
import StudentImage from '@/components/student-home/StudentImage';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getImageUrlCached, getCurrentStudentRowCached } from '@/lib/client-cache';
import { STUDENT_IMAGE_HINT_KEY, pickAuthAvatarUrl } from '@/components/sidebar/types';

export default function HomeHeader({
  displayName,
  avatarUrl, // optional initial value from server; we'll resolve a better one client-side
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const [imgUrl, setImgUrl] = React.useState<string | null>(avatarUrl ?? null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();

      await ensureSessionReady(supabase, 2500);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        if (!cancelled) setImgUrl(null);
        return;
      }

      // Single shared cached fetch
      const row = await getCurrentStudentRowCached(supabase);

      // 1) Try localStorage hint first
      let hintedPath: string | null = null;
      try { hintedPath = localStorage.getItem(STUDENT_IMAGE_HINT_KEY); } catch {}

      const imagePath = hintedPath || (row?.image_path ?? null);

      // 2) If we have a storage path, resolve a signed/public URL
      let resolved: string | null = null;
      if (imagePath) {
        try {
          resolved = await getImageUrlCached(supabase, imagePath);
          if (!hintedPath && row?.image_path) {
            try { localStorage.setItem(STUDENT_IMAGE_HINT_KEY, row.image_path); } catch {}
          }
        } catch {
          resolved = null;
        }
      }

      // 3) Fallback: provider avatar (e.g., GitHub/Google)
      if (!resolved) {
        resolved = pickAuthAvatarUrl(user) ?? null;
      }

      if (!cancelled) setImgUrl(resolved);
    })();

    return () => { cancelled = true; };
  }, []);

  const initial = (displayName?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {/* Avatar shell */}
        <div className="h-12 w-12 md:h-14 md:w-14 rounded-full overflow-hidden bg-[#f9f9f9] border border-[#d2d2d2] grid place-items-center">
          {imgUrl ? (
            <div className="w-full h-full">
              <StudentImage imgUrl={imgUrl} alt={`${displayName} avatar`} />
            </div>
          ) : (
            <span className="text-base md:text-lg font-semibold text-[#373737] select-none">
              {initial}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Welcome, {displayName}!</h1>
          <p className="text-sm md:text-base text-[#373737]">Let’s get some reps in today.</p>
        </div>
      </div>
    </header>
  );
}
