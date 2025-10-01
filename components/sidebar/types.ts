import * as React from 'react';

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
  requireAuth?: boolean;
};

export const BRAND = 'PitchTune.Pro';
export const STORAGE_KEY = 'sidebar:collapsed';
export const STUDENT_IMAGE_HINT_KEY = 'ptp:studentImagePath';

export function pickDisplayName(user: { user_metadata?: any; email?: string | null }): string {
  const dn = user?.user_metadata?.display_name;
  if (typeof dn === 'string' && dn.trim()) return dn.trim();
  return user?.email?.split('@')?.[0] ?? 'You';
}
