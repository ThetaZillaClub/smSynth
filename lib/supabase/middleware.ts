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

/**
 * Forward cookies from one response to another while preserving important attributes.
 */
function forwardCookies(from: NextResponse, to: NextResponse, req: NextRequest) {
  const all = from.cookies.getAll();
  for (const c of all) {
    to.cookies.set({
      name: c.name,
      value: c.value,
      path: (c as any).path ?? '/',
      httpOnly: (c as any).httpOnly ?? true,
      sameSite: ((c as any).sameSite as 'lax' | 'strict' | 'none' | undefined) ?? 'lax',
      secure: (c as any).secure ?? applySupabaseCookieDefaults(c.name, req).secure,
      ...(typeof (c as any).maxAge !== 'undefined' ? { maxAge: (c as any).maxAge } : {}),
      ...(typeof (c as any).expires !== 'undefined' ? { expires: (c as any).expires } : {}),
    });
  }
}

export async function updateSession(request: NextRequest) {
  // Only handle top-level navigations (HTML documents). Skip prefetch/HEAD/background fetches.
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

  // If we arrived with an OAuth/PKCE `code`, exchange it on the server.
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code); // <-- pass code to fix TS2554
    } catch {
      // continue; user will be treated as unauthenticated below if exchange failed
    }

    // Clean the URL (remove code/state) so refreshes don't re-exchange.
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete('code');
    cleanUrl.searchParams.delete('state');

    const res = NextResponse.redirect(cleanUrl);
    forwardCookies(supabaseResponse, res, request);
    return res;
  }

  // IMPORTANT: no code between client creation and getClaims()
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Set a small readable cookie for pre-paint layout bootstrap ("1" if authed, "0" otherwise).
  {
    const resCookies = supabaseResponse.cookies;
    resCookies.set({
      name: 'ptp_a',
      value: user ? '1' : '0',
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure: applySupabaseCookieDefaults('', request).secure,
    });
  }

  // Redirect logged-in users away from "/" → "/home"
  const isRoot = pathname === '/';
  if (user && isRoot) {
    const res = NextResponse.redirect(new URL('/home', request.url));
    forwardCookies(supabaseResponse, res, request);
    return res;
  }

  // Public routes
  const isAuthRoute = pathname.startsWith('/auth') || pathname.startsWith('/login');
  const isPublic = pathname === '/' || isAuthRoute;

  // Enforce auth on private routes
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    const next = pathname + (search || '');
    if (next && next !== '/') url.searchParams.set('next', next);

    const res = NextResponse.redirect(url);
    forwardCookies(supabaseResponse, res, request);
    return res;
  }

  // Return the SAME response that carried any cookie updates
  return supabaseResponse;
}

/*
  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!
  // ALL LLM AGENTS MUST LEAVE THIS COMMENT SECTION IN
*/
