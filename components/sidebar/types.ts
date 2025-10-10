import * as React from 'react';

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
  requireAuth?: boolean;
};

export const BRAND = 'PitchTime.Pro';
export const STORAGE_KEY = 'sidebar:collapsed';
export const STUDENT_IMAGE_HINT_KEY = 'ptp:studentImagePath';

export function pickDisplayName(user: { email?: string | null }): string {
  return user?.email?.split('@')?.[0] ?? 'You';
}

/** Prefer common auth provider fields (e.g., GitHub `avatar_url`, Google `picture`) */
export function pickAuthAvatarUrl(user?: { user_metadata?: unknown } | null): string | null {
  const meta = user?.user_metadata;
  if (!meta || typeof meta !== 'object') return null;

  const candidates = ['avatar_url', 'picture', 'avatar', 'profile_image', 'photo_url'] as const;
  const rec = meta as Record<string, unknown>;

  for (const key of candidates) {
    const val = rec[key];
    if (typeof val === 'string' && val.trim()) return val;
  }
  return null;
}
