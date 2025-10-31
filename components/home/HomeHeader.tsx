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
  /** Right-side header content split into 3 rows (top/middle/bottom). */
  rightRows,
}: {
  displayName: string;
  avatarUrl: string | null;
  studentImagePath?: string | null;
  /** Controls headline text. 'welcome' => "Welcome back, Name"; 'name' => "Name" */
  headlineMode?: 'welcome' | 'name';
  rightRows?: { top?: React.ReactNode; middle?: React.ReactNode; bottom?: React.ReactNode };
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
    <header className="w-full">
      {/* Constrain header content to the same 6/8 width as the left stage panel for bento alignment */}
      <div className="grid grid-cols-8 gap-3">
        <div className="col-span-8 md:col-span-6">
          {/* 2 columns (left = avatar+name, right = 3 stacked rows) and 3 equal rows on md+ */}
          <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-3 gap-x-3 md:gap-y-0.5 items-center">
            {/* Left: Avatar + Name spans all 3 rows on md+ */}
            <div className="flex items-center gap-3 min-w-0 md:row-span-3">
              <div className="h-12 w-12 md:h-14 md:w-14 rounded-full overflow-hidden bg-[#f9f9f9] border border-[#d2d2d2] grid place-items-center flex-shrink-0">
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
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold truncate">
                  {headlineMode === 'name' ? displayName : <>Welcome back, {displayName}</>}
                </h1>
              </div>
            </div>

            {/* Right: 3 rows (Title / Course / Date), aligned to the right edge of this 6-col region */}
            {rightRows?.top ? (
              <div className="justify-self-end text-right md:row-start-1 md:col-start-2 min-w-0 leading-tight">
                {rightRows.top}
              </div>
            ) : null}
            {rightRows?.middle ? (
              <div className="justify-self-end text-right md:row-start-2 md:col-start-2 min-w-0 leading-tight">
                {rightRows.middle}
              </div>
            ) : null}
            {rightRows?.bottom ? (
              <div className="justify-self-end text-right md:row-start-3 md:col-start-2 min-w-0 leading-tight">
                {rightRows.bottom}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
