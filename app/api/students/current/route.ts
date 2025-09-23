import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  // cookie-based auth
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // still reading from "models" for now
  const { data, error } = await supabase
    .from("models")
    .select("id, creator_display_name, gender, range_low, range_high")
    .eq("uid", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
