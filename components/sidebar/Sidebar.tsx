// components/sidebar/Sidebar.tsx
'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Logo from '@/components/header/Logo';
import StudentImage from '@/components/student-home/StudentImage';
import { getImageUrlCached, ensureSessionReady } from '@/lib/client-cache';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
  requireAuth?: boolean;
};

const BRAND = 'PitchTune.Pro';
const STORAGE_KEY = 'sidebar:collapsed';

// Simple no-store JSON fetch
async function fetchJsonNoStore<T = any>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

// Friendly name
function pickDisplayName(user: { user_metadata?: any; email?: string | null }): string {
  const dn = user?.user_metadata?.display_name;
  if (typeof dn === 'string' && dn.trim()) return dn.trim();
  return user?.email?.split('@')?.[0] ?? 'You';
}

export default function Sidebar() {
  const pathname = usePathname() || '/';
  const router = useRouter();

  const [collapsed, setCollapsed] = React.useState(false);
  const [authed, setAuthed] = React.useState(false);
  const [displayName, setDisplayName] = React.useState('You');
  const [studentImgUrl, setStudentImgUrl] = React.useState<string | null>(null);

  const isAuthRoute = pathname.startsWith('/auth');

  // Root-only setter for CSS var
  const setSidebarWidth = React.useCallback((w: '0px' | '64px' | '240px') => {
    try { document.documentElement.style.setProperty('--sidebar-w', w); } catch {}
  }, []);

  // Read persisted collapsed state once.
  React.useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORAGE_KEY) === '1'); } catch { setCollapsed(false); }
  }, []);

  // Keep CSS var in sync with route + collapsed state for authed users.
  React.useEffect(() => {
    if (isAuthRoute) {
      setSidebarWidth('0px');
      return;
    }
    setSidebarWidth(collapsed ? '64px' : '240px');
  }, [collapsed, isAuthRoute, setSidebarWidth]);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  // Auth + single-student load (no-store everywhere)
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

setDisplayName(pickDisplayName(session!.user));

const metaAvatar = (session!.user.user_metadata?.avatar_path as string | undefined) || null;
if (metaAvatar) {
  try {
    const { data, error } = await supabase.storage.from('avatars').createSignedUrl(metaAvatar, 600);
    if (!cancelled) setStudentImgUrl(error ? null : (data?.signedUrl ?? null));
  } catch {}
  return; // no need to query /api/students/current
}

// try localStorage hint before any network
let hintedPath: string | null = null;
try { hintedPath = localStorage.getItem('ptp:studentImagePath'); } catch {}
if (hintedPath) {
  try {
    const url = await getImageUrlCached(supabase, hintedPath);
    if (!cancelled) setStudentImgUrl(url ?? null);
  } catch {}
  return;
}

// last resort: one no-store GET to learn image_path, then cache the hint
const row = await fetchJsonNoStore<{ image_path?: string }>('/api/students/current');
const imagePath = row?.image_path ?? null;
if (imagePath) {
  try { localStorage.setItem('ptp:studentImagePath', imagePath); } catch {}
  try {
    const url = await getImageUrlCached(supabase, imagePath);
    if (!cancelled) setStudentImgUrl(url ?? null);
  } catch {}
}
    })();

    return () => { cancelled = true; };
  }, [isAuthRoute, setSidebarWidth]);

  const go = React.useCallback((href: string) => router.push(href), [router]);

  const items: NavItem[] = [
    {
      href: '/courses',
      label: 'Courses',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
          <path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h12v2H3z" fill="currentColor"/>
        </svg>
      ),
      match: (p) => p === '/courses' || p.startsWith('/courses/'),
      requireAuth: true,
    },
    {
      href: '/setup',
      label: 'Setup',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
          <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.94 3a7.948 7.948 0 00-.46-1.11l2.12-2.12-2.12-2.12-2.12 2.12c-.35-.2-.72-.37-1.11-.5L16 2h-4l-.35 3.16c-.39.12-.76.29-1.11.5L8.42 3.54 6.3 5.66l2.12 2.12c-.2.35-.37.72-.5 1.11L5 8v4l3.16.35c.12.39.29.76.5 1.11L6.3 15.58l2.12 2.12 2.12-2.12c-.2-.35.37-.72.5-1.11L23 12v-1z" fill="currentColor"/>
        </svg>
      ),
      match: (p) => p === '/setup' || p.startsWith('/setup/'),
      requireAuth: true,
    },
    {
      href: '/premium',
      label: 'Premium',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
          <path d="M12 2l3 7h7l-5.5 4.1L18 22l-6-3.8L6 22l1.5-8.9L2 9h7z" fill="currentColor"/>
        </svg>
      ),
      match: (p) => p.startsWith('/premium'),
      requireAuth: false,
    },
  ];

  // ── ROW + COLUMN CLASSES ───────────────────────────────────────
  const baseRow = [
    'flex items-stretch w-full select-none transition',
    'hover:bg-[#e8e8e8] active:bg-[#e0e0e0]',
    'text-[#0f0f0f]',
    'py-3',
  ].join(' ');
  const col1 = 'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';
  const col2 = 'flex-1 flex items-center px-3 text-base font-medium';

  if (isAuthRoute) return <aside style={{ display: 'none' }} aria-hidden />;

  const showLoggedOutCTAs = !authed;

  return (
    <aside
      className={[
        'sticky top-0 h-svh',
        'bg-[#f4f4f4]',
        'flex flex-col justify-between',
      ].join(' ')}
    >
      <div>
        {/* Brand row */}
        <Link
          href={authed ? '/courses' : '/'}
          prefetch={false}
          className={baseRow}
          onClick={(e) => {
            if (authed) {
              e.preventDefault();
              go('/courses');
            }
          }}
        >
          <div className={col1}><Logo className="w-6 h-6" /></div>
          {!collapsed && <div className={col2}>{BRAND}</div>}
        </Link>

        {/* Nav rows */}
        <nav>
          {items.map((it) => {
            const active = it.match(pathname);
            const disabled = it.requireAuth && !authed;
            return (
              <button
                key={it.href}
                type="button"
                onClick={() => !disabled && go(it.href)}
                className={[
                  baseRow,
                  active ? 'bg-[#eaeaea]' : '',
                  disabled ? 'opacity-60 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <div className={col1} aria-hidden>{it.icon}</div>
                {!collapsed && <div className={col2}>{it.label}</div>}
              </button>
            );
          })}
        </nav>

        {/* Logged-out CTAs */}
        {showLoggedOutCTAs && (
          <div className="px-2 mt-4">
            <button
              type="button"
              onClick={() => go('/auth/sign-up')}
              className="w-full inline-flex justify-center items-center gap-2 rounded-md border border-[#d2d2d2] bg-white px-3 py-2 text-sm font-medium text-[#0f0f0f] transition active:scale-[0.98] hover:bg-white/90"
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => go('/auth/login')}
              className="mt-2 w-full inline-flex justify-center items-center gap-2 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] px-3 py-2 text-sm font-medium text-[#0f0f0f] transition active:scale-[0.98] hover:bg-white"
            >
              Sign In
            </button>
          </div>
        )}
      </div>

      <div>
        {/* Collapse toggle */}
        <button type="button" onClick={toggleCollapsed} className={baseRow}>
          <div className={col1}>
            <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
              <path d="M9 6l6 6-6 6" fill="currentColor" />
            </svg>
          </div>
          {!collapsed && <div className={col2}>Collapse</div>}
        </button>

        {/* Avatar + DisplayName (logged in) → opens /settings */}
        {authed && (
          <button
            type="button"
            className={baseRow}
            onClick={() => go('/settings')}
            title="Settings"
          >
            <div className={col1}>
              <div className="w-6 h-6 rounded overflow-hidden">
                <StudentImage imgUrl={studentImgUrl} alt={displayName} visible />
              </div>
            </div>
            {!collapsed && <div className={col2}>{displayName}</div>}
          </button>
        )}
      </div>
    </aside>
  );
}
