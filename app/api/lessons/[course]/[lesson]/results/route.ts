// app/api/lessons/[course]/[lesson]/results/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TakeScore } from "@/utils/scoring/score";
import { glicko2Update, type GlickoRating, pairwiseFromScores } from "@/lib/rating/glicko2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---------------- util ----------------
const BASE_RATING: GlickoRating = { rating: 1500, rd: 350, vol: 0.06 };
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const get = (o: unknown, k: string): unknown =>
  o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined;

const toNum = (v: unknown, def = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
};
const toInt = (v: unknown, def = 0): number => Math.round(toNum(v, def));
const toOptionalInt = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (x: number) => Math.round(x * 100) / 100; // numeric(*,2)
const r5 = (x: number) => Math.round(x * 1e5) / 1e5; // numeric(*,5)
const isUuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const SCORE_LETTERS = new Set(["A", "B", "C", "D", "F"]);
const resolveLetter = (raw: unknown, percent: number): string => {
  const v = typeof raw === "string" ? raw.toUpperCase() : "";
  if (SCORE_LETTERS.has(v)) return v;
  if (percent >= 90) return "A";
  if (percent >= 80) return "B";
  if (percent >= 70) return "C";
  if (percent >= 60) return "D";
  return "F";
};

const cleanSeg = (s: string) =>
  decodeURIComponent(String(s)).trim().replace(/^\/+|\/+$/g, "");

// ---------------- shapes ----------------
type InsertedLessonResult = { id: string; final_percent: number };
type LessonBestRow = { result_id: string; final_percent: number; created_at: string };
type LessonResultMin = { uid: string; final_percent: number };
type PlayerRatingRow = { uid: string; rating: number; rd: number; vol: number };

// ---------------- handler ----------------
type RouteParams = { course: string; lesson: string };

export async function POST(
  req: Request,
  ctx: { params: Promise<RouteParams> } // Next 15 typegen expects a Promise here
) {
  const { course, lesson } = await ctx.params;

  const courseSlug = cleanSeg(course);
  const lessonSlug = cleanSeg(lesson);

  if (!courseSlug || !lessonSlug) {
    return NextResponse.json({ error: "invalid course/lesson" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = (claims?.claims?.sub as string | undefined) ?? undefined;
  if (!uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  type Body = {
    sessionId?: string | null;
    takeIndex?: number | null;
    scoreVersion?: number | null;
    isAggregate?: boolean | null;
    visibility?: unknown;
    score: TakeScore;
    snapshots?: unknown;
  };

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.score) return NextResponse.json({ error: "missing score" }, { status: 400 });

  // Only persist aggregate
  if (!body.isAggregate) {
    return NextResponse.json({ ok: true, ignored: "per-take disabled" });
  }

  const s = body.score;

  // Normalized values (match DB numeric precisions)
  const finalPercent = r2(toNum(get(s, "final") && get(s.final as unknown, "percent"), 0));
  const finalLetter = resolveLetter(get(s, "final") && get(s.final as unknown, "letter"), finalPercent);

  const pitchPercent = r2(toNum(get(s, "pitch") && get(s.pitch as unknown, "percent"), 0));
  const pitchTimeOnRatio = r5(clamp01(toNum(get(s, "pitch") && get(s.pitch as unknown, "timeOnPitchRatio"), 0)));
  const pitchCentsMae = r2(toNum(get(s, "pitch") && get(s.pitch as unknown, "centsMae"), 0));

  const rhythmMelodyPercent = r2(toNum(get(s, "rhythm") && get(s.rhythm as unknown, "melodyPercent"), 0));
  const rhythmLineEvaluated = Boolean(get(s, "rhythm") && get(s.rhythm as unknown, "lineEvaluated"));
  const rhythmLinePercentRaw = toNum(get(s, "rhythm") && get(s.rhythm as unknown, "linePercent"), 0);
  const rhythmLinePercent = rhythmLineEvaluated ? r2(rhythmLinePercentRaw) : null;

  const intervalsCorrectRatio = r5(
    clamp01(toNum(get(s, "intervals") && get(s.intervals as unknown, "correctRatio"), 0))
  );

  const sessionId = isUuid(body.sessionId) ? body.sessionId : null;

  // 1) Insert aggregate result with **course_slug + lesson_slug**
  const { data: inserted, error: insErr } = await supabase
    .from("lesson_results")
    .insert({
      uid,
      course_slug: courseSlug,
      lesson_slug: lessonSlug,
      session_id: sessionId,
      take_index: 0,
      final_percent: finalPercent,
      final_letter: finalLetter,
      pitch_percent: pitchPercent,
      pitch_time_on_ratio: pitchTimeOnRatio,
      pitch_cents_mae: pitchCentsMae,
      rhythm_melody_percent: rhythmMelodyPercent,
      rhythm_line_percent: rhythmLinePercent,
      intervals_correct_ratio: intervalsCorrectRatio,
      details: null,
    })
    .select("id, final_percent")
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { id: resultId } = inserted as InsertedLessonResult;

  // 1a) Child tables (best-effort)
  try {
    const perNote = Array.isArray(s.pitch?.perNote) ? (s.pitch.perNote as unknown[]) : [];
    const rows =
      perNote
        .filter((p) => Number.isFinite(toNum(get(p, "midi"), NaN)))
        .map((p) => ({
          result_id: resultId,
          midi: Math.round(toNum(get(p, "midi"))),
          n: Math.max(1, Math.round(toNum(get(p, "n") ?? 1))),
          ratio: r5(toNum(get(p, "ratio"))),
          cents_mae: r2(toNum(get(p, "centsMae"))),
        })) ?? [];
    if (rows.length) await supabase.from("lesson_result_pitch_notes").insert(rows);
  } catch (e) {
    console.warn("pitch_notes insert:", e);
  }

  try {
    const melArr = Array.isArray(s.rhythm?.perNoteMelody) ? (s.rhythm.perNoteMelody as unknown[]) : [];
    const rows =
      melArr.map((r, i: number) => ({
        result_id: resultId,
        idx: i,
        coverage: toNum(get(r, "coverage")),
        onset_err_ms: toOptionalInt(get(r, "onsetErrMs")),
      })) ?? [];
    if (rows.length) await supabase.from("lesson_result_melody_per_note").insert(rows);
  } catch (e) {
    console.warn("melody_per_note insert:", e);
  }

  try {
    const lineArr = Array.isArray(s.rhythm?.linePerEvent) ? (s.rhythm.linePerEvent as unknown[]) : [];
    const rows =
      lineArr.map((r) => ({
        result_id: resultId,
        value: String(get(r, "value") ?? "unknown"),
        n: Math.max(1, Math.round(toNum(get(r, "n") ?? 1))),
        credit: toNum(get(r, "credit")),
        err_ms: toOptionalInt(get(r, "errMs")),
      })) ?? [];
    if (rows.length) await supabase.from("lesson_result_rhythm_per_event").insert(rows);
  } catch (e) {
    console.warn("rhythm_per_event insert:", e);
  }

  try {
    const icArr = Array.isArray(s.intervals?.classes) ? (s.intervals.classes as unknown[]) : [];
    const rows =
      icArr.map((c) => ({
        result_id: resultId,
        semitones: toInt(get(c, "semitones")),
        attempts: Math.max(0, toInt(get(c, "attempts"))),
        correct: Math.max(0, toInt(get(c, "correct"))),
      })) ?? [];
    if (rows.length) await supabase.from("lesson_result_interval_classes").insert(rows);
  } catch (e) {
    console.warn("interval_classes insert:", e);
  }

  // 2) Upsert per-lesson best **by (uid, course_slug, lesson_slug)**
  const { data: currentBestRaw, error: bestSelErr } = await supabase
    .from("lesson_bests")
    .select("result_id, final_percent, created_at")
    .eq("uid", uid)
    .eq("course_slug", courseSlug)
    .eq("lesson_slug", lessonSlug)
    .maybeSingle();
  if (bestSelErr) console.warn("lesson_bests select error:", bestSelErr.message);

  const currentBest = (currentBestRaw ?? null) as LessonBestRow | null;
  const isBetter =
    !currentBest || Number((inserted as InsertedLessonResult).final_percent) >= Number(currentBest.final_percent);

  if (isBetter) {
    const up = await supabase
      .from("lesson_bests")
      .upsert(
        {
          uid,
          course_slug: courseSlug,
          lesson_slug: lessonSlug,
          result_id: resultId,
          final_percent: (inserted as InsertedLessonResult).final_percent,
        },
        { onConflict: "uid,course_slug,lesson_slug" }
      )
      .select("uid")
      .single();
    if (up.error) console.warn("lesson_bests upsert error:", up.error.message);
  }

  // 3) Ratings — pool = `lesson:${courseSlug}/${lessonSlug}` (namespaced)
  const periodStart = new Date(); periodStart.setUTCHours(0, 0, 0, 0);
  const periodEnd   = new Date(); periodEnd.setUTCHours(23, 59, 59, 999);

  const { data: todaysBestsRaw, error: qErr } = await supabase
    .from("lesson_results")
    .select("uid, final_percent")
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString())
    .eq("course_slug", courseSlug)
    .eq("lesson_slug", lessonSlug);

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const todaysBests = (todaysBestsRaw ?? []) as LessonResultMin[];
  const byUid = new Map<string, number>();
  for (const r of todaysBests) {
    const fp = Number(r.final_percent);
    const prev = byUid.get(r.uid) ?? -Infinity;
    if (fp > prev) byUid.set(r.uid, fp);
  }

  const pool = `lesson:${courseSlug}/${lessonSlug}`;
  const involved = Array.from(byUid.keys());

  // Ensure baseline row for me
  {
    const { data: haveRow } = await supabase
      .from("player_ratings")
      .select("uid")
      .eq("uid", uid)
      .eq("pool", pool)
      .maybeSingle();

    if (!haveRow) {
      const baseUpsert = await supabase
        .from("player_ratings")
        .upsert(
          [{ uid, pool, rating: BASE_RATING.rating, rd: BASE_RATING.rd, vol: BASE_RATING.vol, last_period: dateStr(new Date()) }],
          { onConflict: "uid,pool" }
        );
      if (baseUpsert.error) console.warn("player_ratings baseline upsert error:", baseUpsert.error.message);

      const seedEvent = await supabase.from("rating_events").insert({
        pool,
        period_start: dateStr(periodStart),
        period_end: dateStr(periodEnd),
        uid,
        rating_before: BASE_RATING.rating,
        rd_before: BASE_RATING.rd,
        vol_before: BASE_RATING.vol,
        rating_after: BASE_RATING.rating,
        rd_after: BASE_RATING.rd,
        vol_after: BASE_RATING.vol,
        opponents: [] as unknown[],
      });
      if (seedEvent.error) console.warn("rating_events seed insert error:", seedEvent.error.message);
    }
  }

  // Only my update (RLS-safe)
  if (involved.length >= 2) {
    const { data: ratingRowsRaw } = await supabase
      .from("player_ratings")
      .select("uid, rating, rd, vol")
      .in("uid", involved)
      .eq("pool", pool);

    const ratingRows = (ratingRowsRaw ?? []) as PlayerRatingRow[];
    const current: Record<string, GlickoRating> = {};
    for (const u of involved) {
      const row = ratingRows.find((r) => r.uid === u);
      current[u] = row ? { rating: Number(row.rating), rd: Number(row.rd), vol: Number(row.vol) } : { ...BASE_RATING };
    }

    const pairwise = pairwiseFromScores(byUid);
    const meEntry = pairwise.find((e) => e.uid === uid);
    if (meEntry && meEntry.opponents.length) {
      const before = current[uid] ?? { ...BASE_RATING };
      const after = glicko2Update(
        before,
        meEntry.opponents.map((o) => ({ rating: current[o.opp].rating, rd: current[o.opp].rd, outcome: o.outcome }))
      );

      const up = await supabase
        .from("player_ratings")
        .upsert(
          [{ uid, pool, rating: after.rating, rd: after.rd, vol: after.vol, last_period: dateStr(new Date()) }],
          { onConflict: "uid,pool" }
        );
      if (up.error) console.warn("player_ratings upsert error:", up.error.message);

      const ev = await supabase.from("rating_events").insert([
        {
          pool,
          period_start: dateStr(periodStart),
          period_end: dateStr(periodEnd),
          uid,
          rating_before: before.rating,
          rd_before: before.rd,
          vol_before: before.vol,
          rating_after: after.rating,
          rd_after: after.rd,
          vol_after: after.vol,
          opponents: meEntry.opponents.map((o) => ({
            uid: o.opp,
            score: o.score,
            opp_score: o.opp_score,
            outcome: o.outcome,
          })),
        },
      ]);
      if (ev.error) console.warn("rating_events insert error:", ev.error.message);
    }
  }

  return NextResponse.json({ ok: true, resultId });
}
