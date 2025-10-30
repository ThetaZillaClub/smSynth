// components/home/HomeHeader.tsx
'use client';

import * as React from 'react';
import StudentImage from '@/components/student-home/StudentImage';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getImageUrlCached } from '@/lib/client-cache';
import { STUDENT_IMAGE_HINT_KEY, pickAuthAvatarUrl } from '@/components/sidebar/types';
import type { User } from '@supabase/supabase-js';

export default function HomeHeader({
  displayName,
  avatarUrl,
  studentImagePath, // passed from /home bootstrap
  headlineMode = 'welcome', // 'welcome' | 'name'
}: {
  displayName: string;
  avatarUrl: string | null;
  studentImagePath?: string | null;
  /** Controls headline text. 'welcome' => "Welcome back, Name"; 'name' => "Name" */
  headlineMode?: 'welcome' | 'name';
}) {
  const [imgUrl, setImgUrl] = React.useState<string | null>(avatarUrl ?? null);

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function resolveAndSet(userArg?: User | null) {
      if (cancelled) return;

      // Prefer bootstrap-provided path
      let path: string | null = studentImagePath ?? null;

      // Fallback to localStorage hint
      if (!path) {
        try { path = localStorage.getItem(STUDENT_IMAGE_HINT_KEY); } catch {}
      }

      // Resolve to URL (default bucket = avatars if missing)
      let resolved: string | null = null;
      if (path) {
        try {
          resolved = await getImageUrlCached(supabase, path, { defaultBucket: 'model-images' });
        } catch {
          resolved = null;
        }
      }

      // Fallback to provider avatar
      if (!resolved) {
        let user = userArg ?? null;
        if (!user) {
          const { data: { session } } = await supabase.auth.getSession();
          user = session?.user ?? null;
        }
        resolved = pickAuthAvatarUrl(user) ?? null;
      }

      if (!cancelled) setImgUrl(resolved);
    }

    (async () => {
      await ensureSessionReady(supabase, 2500).catch(() => {});
      await resolveAndSet();
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      resolveAndSet(session?.user ?? null);
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === STUDENT_IMAGE_HINT_KEY) resolveAndSet();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
      window.removeEventListener('storage', onStorage);
    };
  }, [studentImagePath]);

  const initial = (displayName?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
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
          <h1 className="text-2xl md:text-3xl font-bold">
            {headlineMode === 'name' ? displayName : <>Welcome back, {displayName}</>}
          </h1>
        </div>
      </div>
    </header>
  );
}
