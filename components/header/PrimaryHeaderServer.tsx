// components/header/PrimaryHeaderServer.tsx
// Server wrapper: derive initialAuthed from JWT claims (no network),
// so we avoid the "insecure" warning and extra /auth/v1/user calls.

import PrimaryHeader, { type PrimaryHeaderProps } from './PrimaryHeader';
import { createClient } from '@/lib/supabase/server';

export default async function PrimaryHeaderServer(
  props: Omit<PrimaryHeaderProps, 'initialAuthed'>
) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims(); // cookie/JWT-based, no fetch
  const initialAuthed = !!data?.claims?.sub;        // truthy if a session cookie exists
  return <PrimaryHeader {...props} initialAuthed={initialAuthed} />;
}
