// app/api/students/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "node:crypto";

type StudentRow = {
  id: string;
  name: string;
  creator_display_name: string;
  image_path: string | null;
  privacy: "public" | "private";
  gender: "male" | "female" | "unspecified" | "other";
  range_low: string | null;
  range_high: string | null;
  updated_at?: string;
};

function makeETag(payload: unknown) {
  const h = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("base64");
  return `"${h}"`;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("models")
    .select("id,name,creator_display_name,image_path,privacy,gender,range_low,range_high,updated_at")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const body = data as StudentRow;
  const etag = makeETag(body);
  const inm = req.headers.get("if-none-match");
  if (inm && inm === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=600, stale-while-revalidate=1200",
        Vary: "Cookie",
      },
    });
  }

  return NextResponse.json(body, {
    headers: {
      ETag: etag,
      "Cache-Control": "private, max-age=600, stale-while-revalidate=1200",
      Vary: "Cookie",
    },
  });
}
