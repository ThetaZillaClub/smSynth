// components/sidebar/hooks/useSidebarBootstrap.ts
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ensureSessionReady,
  getImageUrlCached,
  getCurrentStudentRowCached,
} from '@/lib/client-cache';
import { STUDENT_IMAGE_HINT_KEY, pickDisplayName, pickAuthAvatarUrl } from '../types';

function readAuthedCookie(): boolean {
  try {
    return (document.cookie.match(/(?:^|; )ptp_a=([^;]+)/)?.[1] === '1');
  } catch {
    return false;
  }
}

export function useSidebarBootstrap(opts: {
  isAuthRoute: boolean;
  setSidebarWidth: (w: string) => void;
}) {
  const { isAuthRoute, setSidebarWidth } = opts;

  // Seed initial authed from the readable cookie for instant correct UI
  const [authed, setAuthed] = React.useState<boolean>(() =>
    typeof document !== 'undefined' ? readAuthedCookie() : false
  );
  const [displayName, setDisplayName] = React.useState('You');
  const [studentImgUrl, setStudentImgUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    // Subscribe to auth changes for instant UI swap on logout/login
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      // Only DOWNGRADE to logged-out on SIGNED_OUT.
      if (event === 'SIGNED_OUT') {
        setAuthed(false);
        setDisplayName('You');
        setStudentImgUrl(null);
        try {
          localStorage.removeItem(STUDENT_IMAGE_HINT_KEY);
        } catch {}
        // While logged out (and not on /auth), keep sidebar open for CTAs.
        if (!isAuthRoute) setSidebarWidth('var(--sidebar-w-open)');
        return;
      }

      // UPGRADE to authed on these events when a user exists.
      if (
        (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') &&
        session?.user
      ) {
        setAuthed(true);
        // Do NOT touch width here; let Sidebar's collapsed state control it.
        return;
      }

      // Otherwise (INITIAL_SESSION with no session), do nothing here.
    });

    (async () => {
      await ensureSessionReady(supabase, 2500);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      const user = session?.user ?? null;

      // Never DOWNGRADE here; if we have no user, keep current state.
      if (!user) {
        if (!isAuthRoute) setSidebarWidth('var(--sidebar-w-open)'); // show CTAs while logged out
        setStudentImgUrl(null);
        setDisplayName('You');
        return;
      }

      // We definitively have a user → ensure authed (upgrade only)
      setAuthed(true);

      // Load name + image from a single cached call (dedupes across app)
      const row = await getCurrentStudentRowCached(supabase);

      const nameFromModel = (row?.creator_display_name || '').trim();
      setDisplayName(nameFromModel || pickDisplayName(user));

      // Image priority:
      // 1) LocalStorage hint of models.image_path
      // 2) /api row.image_path (via cached row above)
      // 3) auth user_metadata avatar (GitHub/Google/etc)
      let hintedPath: string | null = null;
      try {
        hintedPath = localStorage.getItem(STUDENT_IMAGE_HINT_KEY);
      } catch {}

      const imagePath = hintedPath || (row?.image_path ?? null);
      const authAvatar = pickAuthAvatarUrl(user);

      if (imagePath) {
        try {
          const url = await getImageUrlCached(supabase, imagePath, { defaultBucket: 'model-images' });

          if (!cancelled) setStudentImgUrl(url ?? authAvatar ?? null);
          try {
            if (!hintedPath && row?.image_path) localStorage.setItem(STUDENT_IMAGE_HINT_KEY, row.image_path);
          } catch {}
        } catch {
          if (!cancelled) setStudentImgUrl(authAvatar ?? null);
        }
      } else {
        setStudentImgUrl(authAvatar ?? null);
      }

      // Do NOT force width here; Sidebar manages it via collapsed state.
    })();

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [isAuthRoute, setSidebarWidth]);

  return { authed, displayName, studentImgUrl, setStudentImgUrl };
}
