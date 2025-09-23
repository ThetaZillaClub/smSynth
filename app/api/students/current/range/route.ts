import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("models")
    .select("range_low, range_high")
    .eq("uid", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));
  const low = typeof body.low === "string" ? body.low : undefined;
  const high = typeof body.high === "string" ? body.high : undefined;

  // find latest model row for this user
  const { data: latest, error: findErr } = await supabase
    .from("models")
    .select("id")
    .eq("uid", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!latest?.id) return NextResponse.json({ error: "no model row" }, { status: 400 });

  const payload: Record<string, string> = {};
  if (low) payload.range_low = low;
  if (high) payload.range_high = high;

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("models")
    .update(payload)
    .eq("id", latest.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
