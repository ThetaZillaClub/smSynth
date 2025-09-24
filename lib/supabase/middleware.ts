// lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

const SKIP_PREFIXES = [
  "/api",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/icon",
];

// Best effort: reproduce Supabase auth cookie attributes when re-setting on a new response.
// We only know name/value via .getAll(), so we re-apply sane defaults.
function applySupabaseCookieDefaults(
  name: string,
  request: NextRequest,
): { path: string; httpOnly: boolean; sameSite: "lax"; secure: boolean } {
  // secure only when https (local dev often http)
  const xfProto = request.headers.get("x-forwarded-proto");
  const isHttps =
    request.nextUrl.protocol === "https:" || xfProto === "https";
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: !!isHttps,
  };
}

// Copy cookies from one NextResponse to another (used for redirects)
function copyCookies(from: NextResponse, to: NextResponse, req: NextRequest) {
  for (const c of from.cookies.getAll()) {
    const opts = applySupabaseCookieDefaults(c.name, req);
    to.cookies.set({
      name: c.name,
      value: c.value,
      ...opts,
    });
  }
}

export async function updateSession(request: NextRequest, _ev?: NextFetchEvent) {
  // Start with a pass-through response that carries the request (and its cookies)
  let supabaseResponse = NextResponse.next({ request });

  const { pathname, search } = request.nextUrl;

  // Skip non-app paths
  if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
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
            // options available here → use them on the pass-through response
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // IMPORTANT: no code between client creation and getClaims()
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Public routes
  const isAuthRoute = pathname.startsWith("/auth") || pathname.startsWith("/login");
  const isPublic = pathname === "/" || isAuthRoute;

  // Enforce auth
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    const next = pathname + (search || "");
    if (next && next !== "/") url.searchParams.set("next", next);

    // Create the redirect response and copy any Set-Cookie from supabaseResponse
    const res = NextResponse.redirect(url);
    copyCookies(supabaseResponse, res, request);
    return res;
  }

  // Return the SAME response that carried any cookie updates
  return supabaseResponse;
}
