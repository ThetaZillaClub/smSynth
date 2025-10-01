// components/sidebar/hooks/useSidebarBootstrap.ts
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getImageUrlCached } from '@/lib/client-cache';
import { fetchJsonNoStore } from '../fetch/noStore';
import { STUDENT_IMAGE_HINT_KEY, pickDisplayName } from '../types';

export function useSidebarBootstrap(opts: {
  isAuthRoute: boolean;
  setSidebarWidth: (w: '0px'|'64px'|'240px') => void;
}) {
  const { isAuthRoute, setSidebarWidth } = opts;

  const [authed, setAuthed] = React.useState(false);
  const [displayName, setDisplayName] = React.useState('You');
  const [studentImgUrl, setStudentImgUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      await ensureSessionReady(supabase, 2500);
      const { data: { session } } = await supabase.auth.getSession();

      if (cancelled) return;

      const isAuthed = !!session?.user;
      setAuthed(isAuthed);

      // While logged out (and not on /auth), force the sidebar open so CTAs are visible.
      if (!isAuthed && !isAuthRoute) {
        setSidebarWidth('240px');
      }

      if (!isAuthed) {
        setStudentImgUrl(null);
        setDisplayName('You');
        return;
      }

      const user = session!.user;

      // First: attempt to load name & image from our /api (no-store) → models row
      // This avoids reading auth.user_metadata entirely.
      const row = await fetchJsonNoStore<{ creator_display_name?: string; image_path?: string }>('/api/students/current');

      const nameFromModel = (row?.creator_display_name || '').trim();
      setDisplayName(nameFromModel || pickDisplayName(user)); // fallback to email prefix

      // Image priority:
      // 1) LocalStorage hint of models.image_path
      // 2) /api row.image_path
      // 3) Nothing
      let hintedPath: string | null = null;
      try { hintedPath = localStorage.getItem(STUDENT_IMAGE_HINT_KEY); } catch {}

      const imagePath = hintedPath || (row?.image_path ?? null);
      if (imagePath) {
        try {
          const url = await getImageUrlCached(supabase, imagePath);
          if (!cancelled) setStudentImgUrl(url ?? null);
          try {
            if (!hintedPath) localStorage.setItem(STUDENT_IMAGE_HINT_KEY, imagePath);
          } catch {}
        } catch {/* ignore */}
      } else {
        setStudentImgUrl(null);
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthRoute, setSidebarWidth]);

  return { authed, displayName, studentImgUrl, setStudentImgUrl };
}
