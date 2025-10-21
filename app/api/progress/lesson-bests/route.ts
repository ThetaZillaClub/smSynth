// app/api/progress/lesson-bests/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COURSES } from "@/lib/courses/registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RowBests = { course_slug?: string | null; lesson_slug: string; final_percent: number };
type OutRow  = { lesson_slug: string; final_percent: number };

function uniqueCourseForLesson(lesson: string): string | null {
  const matches: string[] = [];
  for (const c of COURSES) {
    if (c.lessons.some((l) => l.slug === lesson)) matches.push(c.slug);
  }
  return matches.length === 1 ? matches[0] : null;
}

function toNamespacedKey(course: string | null | undefined, lesson: string): string {
  const c = (course ?? "").trim();
  const l = (lesson ?? "").trim();
  if (c && c !== "__legacy__") return `${c}/${l}`;
  const inferred = uniqueCourseForLesson(l);
  return inferred ? `${inferred}/${l}` : l; // legacy: leave bare if ambiguous
}

export async function GET() {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const uid = (claims?.claims?.sub as string | undefined) ?? undefined;
  if (!uid) {
    return new NextResponse(null, {
      status: 401,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  }

  const [bestsRes, resultsRes] = await Promise.all([
    supabase
      .from("lesson_bests")
      .select("course_slug, lesson_slug, final_percent")
      .eq("uid", uid),
    supabase
      .from("lesson_results")
      .select("course_slug, lesson_slug, final_percent")
      .eq("uid", uid),
  ]);

  if (bestsRes.error) {
    return NextResponse.json({ error: bestsRes.error.message }, { status: 500 });
  }
  if (resultsRes.error) {
    return NextResponse.json({ error: resultsRes.error.message }, { status: 500 });
  }

  const rows: RowBests[] = [
    ...((bestsRes.data ?? []) as RowBests[]),
    ...((resultsRes.data ?? []) as RowBests[]),
  ];

  // Reduce to max by namespaced key
  const maxByKey = new Map<string, number>();
  for (const r of rows) {
    const key = toNamespacedKey(r.course_slug, r.lesson_slug);
    if (!key) continue;
    const pct = Number(r.final_percent ?? 0);
    const prev = maxByKey.get(key);
    if (prev === undefined || pct > prev) maxByKey.set(key, pct);
  }

  const out: OutRow[] = Array.from(maxByKey, ([lesson_slug, final_percent]) => ({
    lesson_slug,
    final_percent,
  }));

  return NextResponse.json(out, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
