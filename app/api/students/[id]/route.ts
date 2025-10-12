// app/api/students/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  name: string;
  creator_display_name: string;
  image_path: string | null;
  privacy: "public" | "private";
  // gender removed from DB
  range_low: string | null;
  range_high: string | null;
  updated_at?: string;
};

/**
 * Never emit 304s here either; return a body with `no-store`.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("models")
    // ⬇️ gender removed
    .select("id,name,creator_display_name,image_path,privacy,range_low,range_high,updated_at")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 404, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }
    );
  }

  return NextResponse.json(data as StudentRow, {
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
