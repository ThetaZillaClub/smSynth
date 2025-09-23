// lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

/** Extra safety: never guard these paths even if the root matcher changes */
const SKIP_PREFIXES = [
  "/api",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/icon",
];

export async function updateSession(request: NextRequest) {
  // Always start with a pass-through response that carries the request (and its cookies)
  let supabaseResponse = NextResponse.next({ request });

  // If env is not configured yet, don't run auth checks
  if (!hasEnvVars) return supabaseResponse;

  const { pathname, search } = request.nextUrl;

  // Extra guard (root matcher already skips most of these)
  if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // With Fluid compute, always instantiate per-request
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Keep browser/server cookies in sync
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not insert any code between createServerClient and getClaims()
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Public & auth routes that shouldn't force-login
  const isAuthRoute = pathname.startsWith("/auth") || pathname.startsWith("/login");
  const isPublicExact = pathname === "/"; // add more exact public paths here if needed
  const isPublic = isPublicExact || isAuthRoute;

  // If not logged in and not on a public/auth page, send to login (preserve intended destination)
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    const next = pathname + (search || "");
    if (next && next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // Always return the SAME response object that carried cookie updates
  return supabaseResponse;
}
