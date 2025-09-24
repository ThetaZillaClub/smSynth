// components/header/PrimaryHeader.tsx
'use client';

import { type FC, type MouseEvent, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BeginJourneyButton from './BeginJourneyButton';
import SignOutButton from './SignOutButton';
import { createClient } from '@/lib/supabase/client';
import Logo from './Logo';

export interface SectionLink { href: string; label: string }
export interface PrimaryHeaderProps {
  sections?: ReadonlyArray<SectionLink>;
  className?: string;
  /** Passed from a Server Component so SSR and first client render match */
  initialAuthed?: boolean;
}

/** augment window for our auth seed */
declare global {
  interface Window { __PTP_AUTH?: boolean }
}

/** read a fast local seed for SPA navigations (window global first, then cookie) — only after mount */
function readAuthSeed(): boolean | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.__PTP_AUTH === 'boolean') return window.__PTP_AUTH;
  const m = typeof document !== 'undefined'
    ? document.cookie.match(/(?:^|;\s*)ptp_is_auth=(\d)(?:;|$)/)
    : null;
  return m ? m[1] === '1' : null;
}

/** write seed to both window + cookie so subsequent mounts have instant state */
function writeAuthSeed(isAuthed: boolean) {
  if (typeof window !== 'undefined') window.__PTP_AUTH = isAuthed;
  if (typeof document !== 'undefined') {
    const maxAge = 60 * 60 * 24 * 7; // 7 days
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `ptp_is_auth=${isAuthed ? '1' : '0'}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  }
}

const scrollToTop = () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { window.scrollTo(0, 0); } };
const scrollElementIntoView = (el: Element) => {
  try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  catch {
    const r = (el as HTMLElement).getBoundingClientRect().top;
    window.scrollTo(0, r + (window.scrollY || window.pageYOffset));
  }
};

const PrimaryHeader: FC<PrimaryHeaderProps> = ({ sections = [], className = '', initialAuthed }) => {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();

  // SSR and the first client render are identical when `initialAuthed` is provided.
  // If rendered without the server wrapper, we fall back to a 'boot' skeleton.
  const [phase, setPhase] = useState<'boot' | 'ready'>(initialAuthed === undefined ? 'boot' : 'ready');
  const [authed, setAuthed] = useState<boolean>(initialAuthed ?? false);

  useEffect(() => {
    let cancelled = false;

    // Keep the seed in sync with SSR-provided value (no network)
    if (initialAuthed !== undefined) writeAuthSeed(initialAuthed);

    // Fast local seed AFTER mount (only used if no initialAuthed)
    if (initialAuthed === undefined) {
      const seeded = readAuthSeed();
      if (seeded != null) {
        setAuthed(seeded);
        setPhase('ready');
      }
    }

    // Local-first session fetch — ONLY if we didn't get initialAuthed
    (async () => {
      if (initialAuthed !== undefined) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const isAuthed = !!session?.user;
      setAuthed(isAuthed);
      writeAuthSeed(isAuthed);
      setPhase('ready');
    })();

    // Live updates for login/logout/refresh — local-first
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (cancelled) return;
      const isAuthed = !!session?.user;
      setAuthed(isAuthed);
      writeAuthSeed(isAuthed);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, initialAuthed]);

  const navLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      prefetch={false}
      className={`
        text-base sm:font-medium font-medium
        text-[#0f0f0f]
        transition duration-200
        ${pathname === href ? 'underline underline-offset-4' : 'hover:underline hover:underline-offset-4'}
      `}
    >
      {label}
    </Link>
  );

  const handleSectionClick =
    (href: string) =>
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const id = href.replace('#', '');
      const el = document.getElementById(id);
      if (!el) return;
      scrollElementIntoView(el);
    };

  const brandContent = (
    <div className="flex items-center gap-2">
      <Logo className="w-12 h-12" />
      <span className="text-xl sm:text-2xl md:text-3xl font-semibold text-[#0f0f0f]">PitchTime.Pro</span>
    </div>
  );

  return (
    <header
      className={`
        fixed inset-x-0 top-0 z-20 h-20
        px-2 sm:px-4 md:px-8 lg:px-16
        grid grid-cols-3 items-center
        backdrop-blur-sm backdrop-saturate-50
        bg-[#f0f0f0]/20
        supports-[not(backdrop-filter)]:bg-[#f0f0f0]/20
        ${className}
      `}
    >
      {/* Brand / Home link */}
      <div className="justify-self-start">
        {pathname === '/' ? (
          <a href="#top" onClick={(e) => { e.preventDefault(); scrollToTop(); }}>{brandContent}</a>
        ) : (
          <Link href="/" prefetch={false}>{brandContent}</Link>
        )}
      </div>

      {/* Optional center links */}
      {sections.length ? (
        <nav className="justify-self-center flex space-x-4 sm:space-x-10">
          {sections.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={handleSectionClick(href)}
              className="text-base hidden xl:block lg:text-lg text-[#0f0f0f] transition duration-200 hover:underline hover:underline-offset-4"
            >
              {label}
            </a>
          ))}
        </nav>
      ) : <div className="justify-self-center" />}

      {/* Right side */}
      <div className="justify-self-end flex items-center text-center md:text-sm space-x-1 sm:space-x-1 md:space-x-8">
        {phase === 'boot' ? (
          <div className="flex items-center gap-4">
            <div className="h-5 w-14 rounded bg-[#e5e5e5] animate-pulse" />
            <div className="h-8 w-28 rounded-md bg-[#e5e5e5] animate-pulse" />
          </div>
        ) : !authed ? (
          <>
            {navLink('/auth/login', 'Login')}
            <BeginJourneyButton />
          </>
        ) : (
          <>
            {pathname === '/profile' ? (
              <a
                href="#top"
                onClick={(e) => { e.preventDefault(); scrollToTop(); }}
                className="text-base sm:text-md font-medium text-[#0f0f0f] transition duration-200 hover:underline hover:underline-offset-4"
              >
                Study
              </a>
            ) : (
              navLink('/profile', 'Study')
            )}
            <SignOutButton />
          </>
        )}
      </div>
    </header>
  );
};

export default PrimaryHeader;
