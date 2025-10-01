// app/api/students/current/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Single-student model: never emit 304s.
 * Always send a concrete JSON body with `Cache-Control: private, no-store`.
 * This avoids browsers surfacing 304 with empty bodies to fetch().
 */
export async function GET() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub as string | undefined;

  if (!sub) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }
    );
  }

  const { data: row, error } = await supabase
    .from("models")
    .select("id, creator_display_name, image_path, gender, range_low, range_high, updated_at")
    .eq("uid", sub)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }
    );
  }

  return NextResponse.json(row ?? null, {
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
