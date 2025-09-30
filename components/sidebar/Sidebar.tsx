// components/sidebar/Sidebar.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Logo from '@/components/header/Logo';
import StudentImage from '@/components/student-home/StudentImage';
import { getImageUrlCached, ensureSessionReady } from '@/lib/client-cache';
import { primeActiveStudent } from '@/lib/session/prime';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
  requireAuth?: boolean;
};

const BRAND = 'PitchTune.Pro';
const STORAGE_KEY = 'sidebar:collapsed';

// ── PRIME DEDUPE (avoid POST storm on every nav) ─────────────────────────────
let LAST_PRIMED_ID: string | null = null;
let LAST_PRIMED_AT = 0;
const PRIME_TTL_MS = 5 * 60 * 1000; // 5 minutes

function maybePrimeActiveStudent(studentId: string) {
  if (!studentId) return;
  const now = Date.now();
  if (LAST_PRIMED_ID === studentId && now - LAST_PRIMED_AT < PRIME_TTL_MS) return;
  LAST_PRIMED_ID = studentId;
  LAST_PRIMED_AT = now;
  try { primeActiveStudent(studentId); } catch {}
}

// Helper: derive a friendly display name from the session user
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
  const [currentStudentId, setCurrentStudentId] = React.useState<string | null>(null);

  const isAuthRoute = pathname.startsWith('/auth');

  // Root-only setter for CSS var (prevents hydration mismatch).
  const setSidebarWidth = React.useCallback((w: '0px' | '64px' | '240px') => {
    try { document.documentElement.style.setProperty('--sidebar-w', w); } catch {}
  }, []);

  // Read persisted collapsed state once.
  React.useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORAGE_KEY) === '1'); } catch { setCollapsed(false); }
  }, []);

  // Keep CSS var in sync with route + collapsed state.
  React.useEffect(() => {
    setSidebarWidth(isAuthRoute ? '0px' : (collapsed ? '64px' : '240px'));
  }, [collapsed, isAuthRoute, setSidebarWidth]);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  // Auth + current student image priming (minimize GETs)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      await ensureSessionReady(supabase, 2500);
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      const isAuthed = !!session?.user;
      setAuthed(isAuthed);
      if (!isAuthed) { setStudentImgUrl(null); setCurrentStudentId(null); return; }

      const user = session!.user;
      setDisplayName(pickDisplayName(user));

      // 1) Hints from localStorage (no network)
      let hintedId: string | null = null;
      let hintedImgPath: string | null = null;
      try { hintedId = localStorage.getItem('ptp:activeStudentId'); } catch {}
      try { hintedImgPath = localStorage.getItem('ptp:studentImagePath'); } catch {}

      if (hintedId && !cancelled) setCurrentStudentId(hintedId);
      if (hintedImgPath) {
        try {
          const url = await getImageUrlCached(supabase, hintedImgPath);
          if (!cancelled) setStudentImgUrl(url ?? null);
        } catch {}
      }

      // 2) If either is missing, do ONE cached request to /api/students/current
      if (!hintedId || !hintedImgPath) {
        try {
          const res = await fetch('/api/students/current', { credentials: 'include' });
          if (!res.ok) throw new Error('current-student fetch failed');
          const row = await res.json().catch(() => null);

          const id = (row?.id as string | undefined) ?? null;
          if (!cancelled) setCurrentStudentId(id);
          if (id) { try { localStorage.setItem('ptp:activeStudentId', id); } catch {} }

          // If we still don't have an image path, fetch the single row (cached, short TTL)
          if ((!hintedImgPath) && id) {
            try {
              const res2 = await fetch(`/api/students/${encodeURIComponent(id)}`, { credentials: 'include' });
              if (res2.ok) {
                const full = await res2.json().catch(() => null);
                const imagePath = (full?.image_path as string | undefined) ?? null;
                if (imagePath) {
                  try { localStorage.setItem('ptp:studentImagePath', imagePath); } catch {}
                  const url = await getImageUrlCached(supabase, imagePath);
                  if (!cancelled) setStudentImgUrl(url ?? null);
                }
              }
            } catch {}
          }
        } catch {
          if (!cancelled) setStudentImgUrl((prev) => prev ?? null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Priming-aware navigation (ONLY when needed)
  const smartNavigate = React.useCallback((href: string) => {
    if (currentStudentId) maybePrimeActiveStudent(currentStudentId);
    router.push(href);
  }, [router, currentStudentId]);

  // Pre-collapse immediately before going to /auth/* to avoid any flash.
  const goAuth = React.useCallback((href: '/auth/login' | '/auth/sign-up') => {
    setSidebarWidth('0px');
    router.push(href);
  }, [router, setSidebarWidth]);

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
          <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.94 3a7.948 7.948 0 00-.46-1.11l2.12-2.12-2.12-2.12-2.12 2.12c-.35-.2-.72-.37-1.11-.5L16 2h-4l-.35 3.16c-.39.12-.76.29-1.11.5L8.42 3.54 6.3 5.66l2.12 2.12c-.2.35-.37.72-.5 1.11L5 8v4l3.16.35c.12.39.29.76.5 1.11L6.3 15.58l2.12 2.12 2.12-2.12c.35.2.72.37 1.11.5L12 21h4l.35-3.16c.39-.12.76-.29 1.11-.5l2.12 2.12 2.12-2.12-2.12-2.12c-.2-.35.37-.72.5-1.11L23 12v-1z" fill="currentColor"/>
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
  // Vertical spacing on the row; fixed 64px icon gutter for stable horizontal centering.
  const baseRow = [
    'flex items-stretch w-full select-none transition',
    'hover:bg-[#e8e8e8] active:bg-[#e0e0e0]',
    'text-[#0f0f0f]',
    'py-3',
  ].join(' ');

  // Fixed 64px icon gutter so icons stay centered at the same x-position
  // in both collapsed (64px) and expanded (240px) states.
  const col1 = 'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';

  // Label column gets horizontal padding only; vertical padding comes from baseRow.
  const col2 = 'flex-1 flex items-center px-3 text-base font-medium';

  // On auth routes, render a hidden placeholder to avoid Fast Refresh oddities in dev.
  if (isAuthRoute) {
    return <aside style={{ display: 'none' }} aria-hidden />;
  }

  return (
    <aside
      className={[
        'sticky top-0 h-svh',
        'bg-[#f4f4f4] border-r border-[#d7d7d7]',
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
              smartNavigate('/courses');
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
            return (
              <Link
                key={it.href}
                href={it.href}
                prefetch={false}
                className={[baseRow, active ? 'bg-[#eaeaea]' : ''].join(' ')}
                onClick={(e) => {
                  e.preventDefault();
                  smartNavigate(it.href);
                }}
              >
                <div className={col1} aria-hidden>{it.icon}</div>
                {!collapsed && <div className={col2}>{it.label}</div>}
              </Link>
            );
          })}
        </nav>

        {/* Logged-out CTAs */}
        {!authed && (
          <div className="px-2 mt-4">
            <button
              type="button"
              onClick={() => goAuth('/auth/sign-up')}
              className="w-full inline-flex justify-center items-center gap-2 rounded-md border border-[#d2d2d2] bg-white px-3 py-2 text-sm font-medium text-[#0f0f0f] transition active:scale-[0.98] hover:bg-white/90"
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => goAuth('/auth/login')}
              className="mt-2 w-full inline-flex justify-center items-center gap-2 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] px-3 py-2 text-sm font-medium text-[#0f0f0f] transition active:scale-[0.98] hover:bg-white"
            >
              Sign In
            </button>
          </div>
        )}
      </div>

      <div>
        {/* Collapse */}
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
            onClick={() => {
              if (currentStudentId) maybePrimeActiveStudent(currentStudentId);
              router.push('/settings');
            }}
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
