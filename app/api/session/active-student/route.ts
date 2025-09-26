// app/api/session/active-student/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sets an httpOnly cookie with the active student id.
 * Toggle verification with env:
 *   PTP_VERIFY_ACTIVE_STUDENT=0  → SKIP DB verify (RLS protects reads)
 *   (unset or any other value)   → VERIFY model exists before setting cookie
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json().catch(() => ({} as any));
  const modelId = typeof body?.id === "string" ? body.id : "";

  if (!modelId) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  // Auth via JWT in cookies (no network round-trip)
  const { data: claims } = await supabase.auth.getClaims();
  const sub = claims?.claims?.sub as string | undefined;
  if (!sub) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const requireVerify = process.env.PTP_VERIFY_ACTIVE_STUDENT !== "0";
  if (requireVerify) {
    const { data, error } = await supabase
      .from("models")
      .select("id,uid")
      .eq("id", modelId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }
    // Optional stricter ownership gate:
    // if (data.uid !== sub) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

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
