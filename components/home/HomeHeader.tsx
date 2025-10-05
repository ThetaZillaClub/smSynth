'use client';

import * as React from 'react';
import StudentImage from '@/components/student-home/StudentImage';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getImageUrlCached } from '@/lib/client-cache';
import { fetchJsonNoStore } from '@/components/sidebar/fetch/noStore';
import { STUDENT_IMAGE_HINT_KEY, pickAuthAvatarUrl } from '@/components/sidebar/types';

export default function HomeHeader({
  displayName,
  avatarUrl, // optional initial value from server; we'll resolve a better one client-side
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const [imgUrl, setImgUrl] = React.useState<string | null>(avatarUrl ?? null);

  // Resolve the avatar the same way the sidebar does:
  // 1) localStorage models.image_path hint
  // 2) /api/students/current image_path
  // 3) Supabase storage signed URL
  // 4) auth provider avatar (GitHub/Google) via user_metadata
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();

      // Make sure the session is hydrated client-side
      await ensureSessionReady(supabase, 2500);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        if (!cancelled) setImgUrl(null);
        return;
      }

      // 1) Try localStorage hint first
      let hintedPath: string | null = null;
      try { hintedPath = localStorage.getItem(STUDENT_IMAGE_HINT_KEY); } catch {}

      // 2) Ask API for most-recent student/model row
      const row = await fetchJsonNoStore<{ image_path?: string | null }>('/api/students/current');
      const imagePath = hintedPath || (row?.image_path ?? null);

      // 3) If we have a storage path, resolve a signed/public URL
      let resolved: string | null = null;
      if (imagePath) {
        try {
          resolved = await getImageUrlCached(supabase, imagePath);
          // Persist the hint for faster boot next time
          if (!hintedPath) {
            try { localStorage.setItem(STUDENT_IMAGE_HINT_KEY, imagePath); } catch {}
          }
        } catch {
          resolved = null;
        }
      }

      // 4) Fallback: provider avatar (e.g., GitHub/Google)
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
