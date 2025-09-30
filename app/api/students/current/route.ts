// app/api/students/current/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "node:crypto";

function makeETag(payload: unknown) {
  const h = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("base64");
  return `"${h}"`; // quoted etag
}

export async function GET(req: Request) {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub as string | undefined;
  if (!sub) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: row, error } = await supabase
    .from("models")
    .select("id, creator_display_name, image_path, gender, range_low, range_high, updated_at")
    .eq("uid", sub)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Prepare cache bits
  const body = row ?? null;
  const etag = makeETag(body);
  const inm = req.headers.get("if-none-match");

  if (inm && inm === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=300, stale-while-revalidate=900",
        Vary: "Cookie",
      },
    });
  }

  return NextResponse.json(body, {
    headers: {
      ETag: etag,
      "Cache-Control": "private, max-age=300, stale-while-revalidate=900",
      Vary: "Cookie",
    },
  });
}
