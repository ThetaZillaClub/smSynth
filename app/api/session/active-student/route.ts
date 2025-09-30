// app/api/session/active-student/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_STUDENT_COOKIE = "ptp_active_student";
// client-readable hint cookies (non-httpOnly; short lived)
const HINT_SID_COOKIE = "ptp_sid";
const HINT_SIMG_COOKIE = "ptp_simg";

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let studentId: string | null = null;
  try {
    const raw = await req.json();
    studentId = typeof raw?.studentId === "string" ? raw.studentId.trim() : null;
  } catch {}
  if (!studentId) return NextResponse.json({ error: "missing studentId" }, { status: 400 });

  // also fetch image_path so we can mirror it client-side without extra GETs
  const { data: row, error } = await supabase
    .from("models")
    .select("id, uid, image_path")
    .eq("id", studentId)
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "student not found" }, { status: 404 });
  if (row.uid !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const xfProto = req.headers.get("x-forwarded-proto");
  const secure = url.protocol === "https:" || xfProto === "https";

  const res = NextResponse.json({ ok: true, studentId: row.id, imagePath: row.image_path ?? null });
  // httpOnly (authoritative) cookie
  res.cookies.set({
    name: ACTIVE_STUDENT_COOKIE,
    value: row.id,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  // client-readable hints (non-authoritative, short-lived)
  res.cookies.set({
    name: HINT_SID_COOKIE,
    value: row.id,
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
  });
  res.cookies.set({
    name: HINT_SIMG_COOKIE,
    value: encodeURIComponent(row.image_path ?? ""),
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
  });

  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function GET() {
  const jar = await cookies();
  const id = jar.get(ACTIVE_STUDENT_COOKIE)?.value ?? null;
  const res = NextResponse.json({ studentId: id });
  res.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  res.headers.set("Vary", "Cookie");
  return res;
}
