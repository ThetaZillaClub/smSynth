// app/api/students/current/gesture-latency/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PatchBody = { latency_ms?: unknown };

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = (data?.claims?.sub as string | undefined) ?? null;
  if (!uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: row, error } = await supabase
    .from("models")
    .select("gesture_latency_ms")
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
  const { data } = await supabase.auth.getClaims();
  const uid = (data?.claims?.sub as string | undefined) ?? null;
  if (!uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const raw = await req.json().catch(() => null) as PatchBody | null;
  const n = typeof raw?.latency_ms === "number" ? Math.round(raw!.latency_ms) : NaN;

  if (!Number.isFinite(n) || n < 0 || n > 2000) {
    return NextResponse.json({ error: "invalid latency_ms" }, { status: 400 });
  }

  const { data: latest, error: findErr } = await supabase
    .from("models")
    .select("id")
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!latest?.id) return NextResponse.json({ error: "no model row" }, { status: 400 });

  const { error: updateErr } = await supabase
    .from("models")
    .update({ gesture_latency_ms: n })
    .eq("id", latest.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, gesture_latency_ms: n });
}
