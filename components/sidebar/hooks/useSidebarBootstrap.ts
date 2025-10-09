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
  setSidebarWidth: (w: '0px'|'64px'|'240px') => void;
}) {
  const { isAuthRoute, setSidebarWidth } = opts;

  // Seed initial authed from the readable cookie for instant correct UI
  const [authed, setAuthed] = React.useState<boolean>(() => (typeof document !== 'undefined' ? readAuthedCookie() : false));
  const [displayName, setDisplayName] = React.useState('You');
  const [studentImgUrl, setStudentImgUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    // Subscribe to auth changes for instant UI swap on logout/login
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      // ── IMPORTANT ─────────────────────────────────────────────────────────────
      // Don't let a null INITIAL_SESSION clobber the optimistic cookie seed.
      // Only flip to false on SIGNED_OUT.
      // Flip to true on SIGNED_IN / TOKEN_REFRESHED, or INITIAL_SESSION *with* a user.
      // For INITIAL_SESSION with no session: ignore; let the getSession() path decide.
      // ─────────────────────────────────────────────────────────────────────────
      if (event === 'SIGNED_OUT') {
        setAuthed(false);
        // Immediately switch to logged-out UI & width
        setDisplayName('You');
        setStudentImgUrl(null);
        try { localStorage.removeItem(STUDENT_IMAGE_HINT_KEY); } catch {}
        if (!isAuthRoute) setSidebarWidth('240px');
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && session?.user) {
        setAuthed(true);
        // When signed in, open on first paint; we resolve details below
        if (!isAuthRoute) setSidebarWidth('240px');
        return;
      }

      // Otherwise (INITIAL_SESSION with no session), do nothing here.
    });

    (async () => {
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

      // Load name + image from a single cached call (dedupes across app)
      const row = await getCurrentStudentRowCached(supabase);

      const nameFromModel = (row?.creator_display_name || '').trim();
      setDisplayName(nameFromModel || pickDisplayName(user));

      // Image priority:
      // 1) LocalStorage hint of models.image_path
      // 2) /api row.image_path (via cached row above)
      // 3) auth user_metadata avatar (GitHub/Google/etc)
      let hintedPath: string | null = null;
      try { hintedPath = localStorage.getItem(STUDENT_IMAGE_HINT_KEY); } catch {}

      const imagePath = hintedPath || (row?.image_path ?? null);
      const authAvatar = pickAuthAvatarUrl(user);

      if (imagePath) {
        try {
          const url = await getImageUrlCached(supabase, imagePath);
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

      // Always ensure open width (no collapsed-on-load)
      if (!isAuthRoute) setSidebarWidth('240px');
    })();

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [isAuthRoute, setSidebarWidth]);

  return { authed, displayName, studentImgUrl, setStudentImgUrl };
}
