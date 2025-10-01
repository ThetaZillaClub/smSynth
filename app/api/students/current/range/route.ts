// app/api/students/current/range/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RangePatchBody = { low?: unknown; high?: unknown };

export async function GET() {
  const supabase = await createClient();

  // ✅ No network: JWT claims
  const { data } = await supabase.auth.getClaims();
  const uid = (data?.claims?.sub as string | undefined) ?? null;
  if (!uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: row, error } = await supabase
    .from("models")
    .select("range_low, range_high")
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(row ?? null, {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      Vary: "Cookie",
    },
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();

  // ✅ No network: JWT claims
  const { data } = await supabase.auth.getClaims();
  const uid = (data?.claims?.sub as string | undefined) ?? null;
  if (!uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const raw = (await req.json().catch(() => null)) as unknown;
  const body: RangePatchBody | null = raw && typeof raw === "object" ? (raw as RangePatchBody) : null;

  const low = typeof body?.low === "string" ? body.low : undefined;
  const high = typeof body?.high === "string" ? body.high : undefined;

  const { data: latest, error: findErr } = await supabase
    .from("models")
    .select("id")
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!latest?.id) return NextResponse.json({ error: "no model row" }, { status: 400 });

  const payload: { range_low?: string; range_high?: string } = {};
  if (low) payload.range_low = low;
  if (high) payload.range_high = high;
  if (!payload.range_low && !payload.range_high) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  const { error: updateErr } = await supabase.from("models").update(payload).eq("id", latest.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
