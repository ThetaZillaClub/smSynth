// app/api/session/active-student/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json().catch(() => ({} as any));
  const modelId = typeof body?.id === "string" ? body.id : "";

  if (!modelId) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  // Verify the caller is authenticated and allowed to see this model row
  const { data: claims } = await supabase.auth.getClaims();
  const sub = claims?.claims?.sub as string | undefined;
  if (!sub) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("models")
    .select("id,uid")
    .eq("id", modelId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
  }

  // (Optional) extra safety: ensure ownership or visibility if your RLS requires it
  // if (data.uid !== sub) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Set a short-lived, httpOnly cookie that'll be read by other server routes
  const res = NextResponse.json({ ok: true });
  const isHttps = process.env.NODE_ENV !== "development";
  res.cookies.set("ptp_active_student", modelId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    maxAge: 60 * 60 * 2, // 2h
  });
  return res;
}
