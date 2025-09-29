import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
  // shared singleton in the browser
  var __supabase__: SupabaseClient | undefined;
}

function makeClient(): SupabaseClient {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
      },
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const original: typeof client.auth.getUser = client.auth.getUser.bind(client.auth);
    client.auth.getUser = (async (...args) => {
      console.warn(
        '[supabase] getUser() called on the client. Prefer getSession() to avoid /auth/v1/user.'
      );
      return original(...args);
    }) as typeof client.auth.getUser;
  }

  return client;
}

export function createClient(): SupabaseClient {
  if (!globalThis.__supabase__) {
    globalThis.__supabase__ = makeClient();
  }
  return globalThis.__supabase__!;
}
