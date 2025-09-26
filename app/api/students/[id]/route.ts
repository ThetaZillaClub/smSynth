// app/api/students/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  name: string;
  creator_display_name: string;
  image_path: string | null;
  privacy: "public" | "private";
  gender: "male" | "female" | "unspecified" | "other";
  range_low: string | null;
  range_high: string | null;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("models")
    .select("id,name,creator_display_name,image_path,privacy,gender,range_low,range_high")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json(data as StudentRow, {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      Vary: "Cookie",
    },
  });
}
