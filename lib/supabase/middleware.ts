// lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Never guard these paths via auth redirect */
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
  // Start with a pass-through response that carries the request (and its cookies)
  let supabaseResponse = NextResponse.next({ request });

  const { pathname, search } = request.nextUrl;

  // Skip non-app paths
  if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // New client per request (important for edge / fluid compute)
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

  // IMPORTANT: don't insert code between client creation and getClaims()
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Public routes
  const isAuthRoute = pathname.startsWith("/auth") || pathname.startsWith("/login");
  const isPublicExact = pathname === "/";
  const isPublic = isPublicExact || isAuthRoute;

  // Enforce auth
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    const next = pathname + (search || "");
    if (next && next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // Return the SAME response that carried any cookie updates
  return supabaseResponse;
}
