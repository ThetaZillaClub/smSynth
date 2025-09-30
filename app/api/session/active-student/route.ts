// app/api/session/active-student/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_STUDENT_COOKIE = "ptp_active_student";

/**
 * POST /api/session/active-student
 * Body: { studentId: string }
 * - Verifies the caller is authenticated
 * - (Best practice) Verifies the student row belongs to the user
 * - Sets an httpOnly cookie so subsequent SSR/Route handlers can read it
 */
export async function POST(req: Request) {
  const supabase = await createClient();

  // Ensure caller is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Parse body
  let studentId: string | null = null;
  try {
    const raw = await req.json();
    studentId = typeof raw?.studentId === "string" ? raw.studentId.trim() : null;
  } catch {
    // ignore parse errors; handled below
  }
  if (!studentId) {
    return NextResponse.json({ error: "missing studentId" }, { status: 400 });
  }

  // (Optional but recommended) – verify the model belongs to this user
  const { data: row, error } = await supabase
    .from("models")
    .select("id, uid")
    .eq("id", studentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }
  if (row.uid !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Set cookie with secure defaults
  const url = new URL(req.url);
  const xfProto = req.headers.get("x-forwarded-proto");
  const secure = url.protocol === "https:" || xfProto === "https";

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ACTIVE_STUDENT_COOKIE,
    value: studentId,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // This endpoint mutates cookies — don't cache the response
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

/**
 * GET /api/session/active-student
 * Returns the currently set active student id from the cookie
 * (handy for debugging or lightweight reads).
 */
export async function GET() {
  const jar = await cookies();
  const id = jar.get(ACTIVE_STUDENT_COOKIE)?.value ?? null;
  const res = NextResponse.json({ studentId: id });
  res.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  res.headers.set("Vary", "Cookie");
  return res;
}
