import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

declare global {
  // eslint-disable-next-line no-var
  var __supabase__: SupabaseClient | undefined
}

function makeClient(): SupabaseClient {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      auth: {
        // Avoid extra work and URL parsing on most pages
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
      },
    }
  )

  // Dev-only: warn if anything calls getUser() from the browser
  if (process.env.NODE_ENV !== 'production') {
    const original = client.auth.getUser.bind(client.auth)
    client.auth.getUser = async (...args: any[]) => {
      // eslint-disable-next-line no-console
      console.warn(
        '[supabase] getUser() called on the client. Prefer getSession() to avoid /auth/v1/user.'
      )
      return original(...args)
    }
  }

  return client
}

export function createClient(): SupabaseClient {
  if (!globalThis.__supabase__) {
    globalThis.__supabase__ = makeClient()
  }
  return globalThis.__supabase__!
}
