import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  creator_display_name: string;
  gender: "male" | "female" | "unspecified" | "other";
  range_low: string | null;
  range_high: string | null;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params; // <-- await here

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("models") // keep table name for now
    .select("id, creator_display_name, gender, range_low, range_high")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data as StudentRow);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));

  const payload: Partial<Pick<StudentRow, "range_low" | "range_high">> = {};
  if (typeof body.range_low === "string") payload.range_low = body.range_low;
  if (typeof body.range_high === "string") payload.range_high = body.range_high;

  if (!Object.keys(payload).length) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("models")
    .update(payload)
    .eq("id", id)
    .select("id, creator_display_name, gender, range_low, range_high")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as StudentRow);
}
