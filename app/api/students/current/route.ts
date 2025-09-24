import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  // Zero-network auth check (JWT in cookies)
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub as string | undefined;
  if (!sub) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("models")
    .select("id, creator_display_name, gender, range_low, range_high")
    .eq("uid", sub)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(row ?? null, {
    headers: {
      "Cache-Control": "private, max-age=30", // re-use within the session
      Vary: "Cookie",
    },
  });
}
