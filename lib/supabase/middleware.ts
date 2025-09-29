// lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const SKIP_PREFIXES = [
  '/api',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/opengraph-image',
  '/icon',
];

// Best effort: reproduce Supabase auth cookie attributes when re-setting on a new response.
function applySupabaseCookieDefaults(
  _name: string,
  request: NextRequest
): { path: string; httpOnly: boolean; sameSite: 'lax'; secure: boolean } {
  const xfProto = request.headers.get('x-forwarded-proto');
  const isHttps = request.nextUrl.protocol === 'https:' || xfProto === 'https';
  return { path: '/', httpOnly: true, sameSite: 'lax', secure: !!isHttps };
}

// Copy cookies from one NextResponse to another (used for redirects)
function copyCookies(from: NextResponse, to: NextResponse, req: NextRequest) {
  for (const c of from.cookies.getAll()) {
    const opts = applySupabaseCookieDefaults(c.name, req);
    to.cookies.set({ name: c.name, value: c.value, ...opts });
  }
}

export async function updateSession(request: NextRequest) {
  // Narrow WHEN the middleware does any auth work:
  // - Only handle top-level navigations (HTML documents)
  // - Skip prefetch/HEAD/background fetches
  const dest = request.headers.get('sec-fetch-dest') || '';
  const isDoc = dest === 'document';
  const isHead = request.method === 'HEAD';
  const isPrefetch =
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('next-router-prefetch') === '1';

  const { pathname, search } = request.nextUrl;

  // Start with a pass-through response that carries the request (and its cookies)
  let supabaseResponse = NextResponse.next({ request });

  // Skip non-app paths entirely
  if (
    SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p)) ||
    !isDoc ||
    isHead ||
    isPrefetch
  ) {
    return supabaseResponse;
  }

  // New client per request
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // keep the request & response cookie views in sync
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // IMPORTANT: no code between client creation and getClaims()
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Public routes
  const isAuthRoute = pathname.startsWith('/auth') || pathname.startsWith('/login');
  const isPublic = pathname === '/' || isAuthRoute;

  // Enforce auth
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    const next = pathname + (search || '');
    if (next && next !== '/') url.searchParams.set('next', next);

    // Preserve any Set-Cookie from Supabase
    const res = NextResponse.redirect(url);
    copyCookies(supabaseResponse, res, request);
    return res;
  }

  // Return the SAME response that carried any cookie updates
  return supabaseResponse;
}

// NOTE: When creating a new response, pass the request and copy cookies
// as documented in the comment block from your original file.
