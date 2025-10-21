// app/api/progress/lesson-bests/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the caller's lesson_bests rows using JWT claims (no auth.users lookup).
 * Safe to cache briefly; includes "Vary: Cookie".
 */
export async function GET() {
  const supabase = await createClient();

  // ✅ No network: JWT claims (fast, avoids auth.getUser())
  const { data } = await supabase.auth.getClaims();
  const uid = (data?.claims?.sub as string | undefined) ?? null;
  if (!uid) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }
    );
  }

  const { data: rows, error } = await supabase
    .from("lesson_bests")
    .select("lesson_slug, final_percent")
    .eq("uid", uid);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }
    );
  }

  // Keep it simple: return raw rows; client maps legacy slugs.
  return NextResponse.json(rows ?? [], {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      Vary: "Cookie",
    },
  });
}
