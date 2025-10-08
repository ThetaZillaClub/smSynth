// components/sidebar/Sidebar.tsx
'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BRAND, NavItem } from './types';
import { useCSSSidebarWidth, useCollapsed } from './hooks/useCollapsed';
import { useSidebarBootstrap } from './hooks/useSidebarBootstrap';
import BrandRow from './ui/BrandRow';
import NavButton from './ui/NavButton';
import CTAGroup from './ui/CTAGroup';
import AvatarSettingsButton from './ui/AvatarSettingsButton';
import { CoursesIcon, SetupIcon, PremiumIcon, ChevronRightIcon } from './svg/Icons';

export default function Sidebar() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const isAuthRoute = pathname.startsWith('/auth');

  const setSidebarWidth = useCSSSidebarWidth();
  const { collapsed, toggle } = useCollapsed(false); // always start open (no collapsed FOUC)

  // Track hydration so SSR HTML is auth-agnostic (prevents mismatch)
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  const { authed, displayName, studentImgUrl } = useSidebarBootstrap({
    isAuthRoute,
    setSidebarWidth,
  });

  // Logged-out: open; no collapse control
  const effectiveCollapsed = authed ? collapsed : false;

  // Keep CSS var in sync
  React.useEffect(() => {
    if (isAuthRoute) {
      setSidebarWidth('0px');
      return;
    }
    setSidebarWidth(effectiveCollapsed ? '64px' : '240px');
  }, [effectiveCollapsed, isAuthRoute, setSidebarWidth]);

  const go = React.useCallback((href: string) => router.push(href), [router]);

  const items: NavItem[] = [
    { href: '/courses', label: 'Courses', icon: <CoursesIcon />, match: (p) => p === '/courses' || p.startsWith('/courses/'), requireAuth: true },
    { href: '/setup',   label: 'Setup',   icon: <SetupIcon />,   match: (p) => p === '/setup'   || p.startsWith('/setup/'),   requireAuth: true },
    { href: '/premium', label: 'Premium', icon: <PremiumIcon />, match: (p) => p.startsWith('/premium'), requireAuth: false },
  ];

  if (isAuthRoute) return <aside style={{ display: 'none' }} aria-hidden />;

  // Only decide "locked" after hydration so SSR markup is stable
  const showLoggedOutCTAs = hydrated && !authed;

  return (
    <aside className={['sticky top-0 h-svh', 'bg-[#f4f4f4]', 'flex flex-col justify-between'].join(' ')}>
      <div>
        <BrandRow
          authed={hydrated ? authed : false}
          collapsed={effectiveCollapsed}
          brand={BRAND}
          goHome={() => go('/home')}
        />

        <nav>
          {items.map((it) => {
            const active = it.match(pathname);
            const locked = hydrated ? (it.requireAuth && !authed) : false;

            const handleClick = () => {
              if (locked) {
                go('/auth/login');
              } else {
                go(it.href);
              }
            };

            return (
              <NavButton
                key={it.href}
                active={active}
                onClick={handleClick}
                icon={it.icon}
                label={it.label}
                collapsed={effectiveCollapsed}
                locked={locked}
              />
            );
          })}
        </nav>

        {showLoggedOutCTAs && (
          <CTAGroup onSignup={() => go('/auth/sign-up')} onLogin={() => go('/auth/login')} />
        )}
      </div>

      <div>
        {/* Collapse toggle: only when authed (and only after hydration to avoid SSR/client diff) */}
        {hydrated && authed && (
          <button
            type="button"
            onClick={toggle}
            className={[
              'flex items-stretch w-full select-none transition',
              'hover:bg-[#e8e8e8] active:bg-[#e0e0e0]',
              'text-[#0f0f0f]',
              'py-3',
            ].join(' ')}
          >
            <div className="w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center">
              <ChevronRightIcon />
            </div>
            {!effectiveCollapsed && <div className="flex-1 flex items-center px-3 text-base font-medium">Collapse</div>}
          </button>
        )}

        {/* Avatar row: only after hydration to prevent server/client mismatch */}
        {hydrated && authed && (
          <AvatarSettingsButton
            displayName={displayName}
            imgUrl={studentImgUrl}
            collapsed={effectiveCollapsed}
            onClick={() => go('/settings')}
          />
        )}
      </div>
    </aside>
  );
}
