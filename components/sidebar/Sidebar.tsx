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
import { CoursesIcon, SetupIcon, PremiumIcon } from './svg/Icons';
import CollapseToggleRow from './ui/CollapseToggleRow';

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
  const OPEN_W = 'var(--sidebar-w-open)';
  React.useEffect(() => {
    if (isAuthRoute) {
      setSidebarWidth('0px');
      return;
    }
    setSidebarWidth(effectiveCollapsed ? '64px' : OPEN_W);
  }, [effectiveCollapsed, isAuthRoute, setSidebarWidth]);

  const go = React.useCallback((href: string) => router.push(href), [router]);

  const items: NavItem[] = [
    {
      href: '/courses',
      label: 'Courses',
      icon: <CoursesIcon />,
      match: (p) => p === '/courses' || p.startsWith('/courses/'),
      requireAuth: true,
    },
    {
      href: '/setup',
      label: 'Setup',
      icon: <SetupIcon />,
      match: (p) => p === '/setup' || p.startsWith('/setup/'),
      requireAuth: true,
    },
    {
      href: '/premium',
      label: 'Pro',
      icon: <PremiumIcon />,
      match: (p) => p.startsWith('/premium'),
      requireAuth: false,
    },
  ];

  if (isAuthRoute) return <aside style={{ display: 'none' }} aria-hidden />;

  // Only decide "locked" after hydration so SSR markup is stable
  const showLoggedOutCTAs = hydrated && !authed;

  const isSettings = pathname === '/settings' || pathname.startsWith('/settings/');

  return (
    <aside
      className={[
        'sticky top-0 h-svh flex flex-col justify-between',
        'bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee]',
        'border-r border-[#d9d9d9]',
      ].join(' ')}
    >
      {/* top stack: brand + nav with NO gaps, NO side padding */}
      <div>
        <BrandRow
          authed={hydrated ? authed : false}
          collapsed={effectiveCollapsed}
          brand={BRAND}
          goHome={() => go('/home')}
        />

        <nav>
          {/* no space-y / margins so edges touch */}
          {items.map((it) => {
            const active = it.match(pathname);
            const locked = hydrated ? it.requireAuth && !authed : false;

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
          <CTAGroup
            onSignup={() => go('/auth/sign-up')}
            onLogin={() => go('/auth/login')}
          />
        )}
      </div>

      {/* bottom stack: flush edges; collapse row extracted */}
      <div>
        {hydrated && authed && (
          <CollapseToggleRow collapsed={effectiveCollapsed} onClick={toggle} />
        )}

        {hydrated && authed && (
          <AvatarSettingsButton
            displayName={displayName}
            imgUrl={studentImgUrl}
            collapsed={effectiveCollapsed}
            onClick={() => go('/settings')}
            active={isSettings}
          />
        )}
      </div>
    </aside>
  );
}
