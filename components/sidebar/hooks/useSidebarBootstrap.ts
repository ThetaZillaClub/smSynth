'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getImageUrlCached } from '@/lib/client-cache';
import { fetchJsonNoStore } from '../fetch/noStore';
import { pickDisplayName, STUDENT_IMAGE_HINT_KEY } from '../types';

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
        return;
      }

      const user = session!.user;
      setDisplayName(pickDisplayName(user));

      // 1) Prefer custom avatar
      const metaAvatar = (user.user_metadata?.avatar_path as string | undefined) || null;
      if (metaAvatar) {
        try {
          const { data, error } = await supabase.storage.from('avatars').createSignedUrl(metaAvatar, 600);
          if (!cancelled) setStudentImgUrl(error ? null : (data?.signedUrl ?? null));
        } catch {/* ignore */}
        return; // no need to query /api/students/current
      }

      // 2) Try localStorage hint before any network
      let hintedPath: string | null = null;
      try { hintedPath = localStorage.getItem(STUDENT_IMAGE_HINT_KEY); } catch {}
      if (hintedPath) {
        try {
          const url = await getImageUrlCached(supabase, hintedPath);
          if (!cancelled) setStudentImgUrl(url ?? null);
        } catch {/* ignore */}
        return;
      }

      // 3) Last resort: one no-store GET to learn image_path, then cache the hint
      const row = await fetchJsonNoStore<{ image_path?: string }>('/api/students/current');
      const imagePath = row?.image_path ?? null;
      if (imagePath) {
        try { localStorage.setItem(STUDENT_IMAGE_HINT_KEY, imagePath); } catch {}
        try {
          const url = await getImageUrlCached(supabase, imagePath);
          if (!cancelled) setStudentImgUrl(url ?? null);
        } catch {/* ignore */}
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthRoute, setSidebarWidth]);

  return { authed, displayName, studentImgUrl, setStudentImgUrl };
}
