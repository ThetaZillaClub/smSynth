// app/api/lessons/[lesson]/results/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TakeScore } from "@/utils/scoring/score";
import { glicko2Update, type GlickoRating, pairwiseFromScores } from "@/lib/rating/glicko2";

const BASE_RATING: GlickoRating = { rating: 1500, rd: 350, vol: 0.06 };
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

// small helpers for safe extraction
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

// local row shapes to avoid loose casts
type InsertedLessonResult = { id: number; final_percent: number };
type LessonBestRow = { result_id: number; final_percent: number; created_at: string };
type LessonResultMin = { uid: string; final_percent: number };
type PlayerRatingRow = { uid: string; rating: number; rd: number; vol: number };

export async function POST(req: Request, ctx: { params: Promise<{ lesson: string }> }) {
  const { lesson } = await ctx.params;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const uid = (claims?.claims?.sub as string | undefined) ?? undefined;
  if (!uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  type Body = {
    sessionId?: string;
    takeIndex?: number;
    score: TakeScore;
    snapshots?: unknown;
  };

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.score) return NextResponse.json({ error: "missing score" }, { status: 400 });

  const s = body.score;

  // 1) Insert the main result row
  const { data: inserted, error: insErr } = await supabase
    .from("lesson_results")
    .insert({
      uid,
      lesson_slug: lesson,
      session_id: body.sessionId ?? null,
      take_index: Number.isFinite(body.takeIndex) ? Math.max(0, Math.floor(body.takeIndex!)) : 0,

      final_percent: Math.round(s.final.percent * 100) / 100,
      // ensure a plain string for DB text/varchar column
      final_letter: String(s.final.letter),

      pitch_percent: Math.round(s.pitch.percent * 100) / 100,
      pitch_time_on_ratio: Math.max(0, Math.min(1, s.pitch.timeOnPitchRatio)),
      pitch_cents_mae: Math.round(s.pitch.centsMae * 100) / 100,

      rhythm_melody_percent: Math.round(s.rhythm.melodyPercent * 100) / 100,
      rhythm_line_percent: s.rhythm.lineEvaluated ? Math.round(s.rhythm.linePercent * 100) / 100 : null,

      intervals_correct_ratio: Math.max(0, Math.min(1, s.intervals.correctRatio)),

      // details moved to child tables; keep null to avoid bloat
      details: null,
    })
    .select("id, final_percent")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const insertedRow = inserted as InsertedLessonResult;
  const resultId = insertedRow.id;

  // 1a) Insert child-table details (best-effort; do not fail the request)
  // Pitch notes
  try {
    const perNote = Array.isArray(s.pitch.perNote) ? (s.pitch.perNote as unknown[]) : [];
    const pitchRows =
      perNote
        .filter((p) => Number.isFinite(toNum(get(p, "midi"), NaN)))
        .map((p) => ({
          result_id: resultId,
          midi: Math.round(toNum(get(p, "midi"))),
          n: Math.max(1, Math.round(toNum(get(p, "n") ?? 1))),
          ratio: toNum(get(p, "ratio")),
          cents_mae: toNum(get(p, "centsMae")),
        })) ?? [];

    if (pitchRows.length) {
      const { error } = await supabase.from("lesson_result_pitch_notes").insert(pitchRows);
      if (error) console.warn("pitch_notes insert error:", error.message);
    }
  } catch (e: unknown) {
    console.warn("pitch_notes insert exception:", e instanceof Error ? e.message : e);
  }

  // Melody per-note
  try {
    const melArr = Array.isArray(s.rhythm.perNoteMelody) ? (s.rhythm.perNoteMelody as unknown[]) : [];
    const melRows =
      melArr.map((r, i: number) => ({
        result_id: resultId,
        idx: i,
        coverage: toNum(get(r, "coverage")),
        onset_err_ms: toOptionalInt(get(r, "onsetErrMs")),
      })) ?? [];

    if (melRows.length) {
      const { error } = await supabase.from("lesson_result_melody_per_note").insert(melRows);
      if (error) console.warn("melody_per_note insert error:", error.message);
    }
  } catch (e: unknown) {
    console.warn("melody_per_note insert exception:", e instanceof Error ? e.message : e);
  }

  // Rhythm line per-event
  try {
    const lineArr = Array.isArray(s.rhythm.linePerEvent) ? (s.rhythm.linePerEvent as unknown[]) : [];
    const lineRows =
      lineArr.map((r) => ({
        result_id: resultId,
        value: String(get(r, "value") ?? "unknown"),
        n: Math.max(1, Math.round(toNum(get(r, "n") ?? 1))),
        credit: toNum(get(r, "credit")),
        err_ms: toOptionalInt(get(r, "errMs")),
      })) ?? [];

    if (lineRows.length) {
      const { error } = await supabase.from("lesson_result_rhythm_per_event").insert(lineRows);
      if (error) console.warn("rhythm_per_event insert error:", error.message);
    }
  } catch (e: unknown) {
    console.warn("rhythm_per_event insert exception:", e instanceof Error ? e.message : e);
  }

  // Interval classes
  try {
    const icArr = Array.isArray(s.intervals.classes) ? (s.intervals.classes as unknown[]) : [];
    const icRows =
      icArr.map((c) => ({
        result_id: resultId,
        semitones: toInt(get(c, "semitones")),
        attempts: Math.max(0, toInt(get(c, "attempts"))),
        correct: Math.max(0, toInt(get(c, "correct"))),
      })) ?? [];

    if (icRows.length) {
      const { error } = await supabase.from("lesson_result_interval_classes").insert(icRows);
      if (error) console.warn("interval_classes insert error:", error.message);
    }
  } catch (e: unknown) {
    console.warn("interval_classes insert exception:", e instanceof Error ? e.message : e);
  }

  // 2) Upsert per-lesson best
  const { data: currentBestRaw } = await supabase
    .from("lesson_bests")
    .select("result_id, final_percent, created_at")
    .eq("uid", uid)
    .eq("lesson_slug", lesson)
    .maybeSingle();

  const currentBest = (currentBestRaw ?? null) as LessonBestRow | null;

  const isBetter =
    !currentBest || insertedRow.final_percent >= Number(currentBest.final_percent);

  if (isBetter) {
    const up = await supabase
      .from("lesson_bests")
      .upsert({
        uid,
        lesson_slug: lesson,
        result_id: resultId,
        final_percent: insertedRow.final_percent,
      })
      .select("uid")
      .single();
    if (up.error) console.warn("lesson_bests upsert error:", up.error.message);
  }

  // 3) Ratings (Glicko-2) — pool=lesson:<slug>, daily period (UTC)
  const periodStart = new Date();
  periodStart.setUTCHours(0, 0, 0, 0);
  const periodEnd = new Date();
  periodEnd.setUTCHours(23, 59, 59, 999);

  // Best today per uid in this lesson
  const { data: todaysBestsRaw, error: qErr } = await supabase
    .from("lesson_results")
    .select("uid, final_percent")
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString())
    .eq("lesson_slug", lesson);

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const todaysBests = (todaysBestsRaw ?? []) as LessonResultMin[];
  const byUid = new Map<string, number>();
  for (const r of todaysBests) {
    const fp = Number(r.final_percent);
    const prev = byUid.get(r.uid) ?? -Infinity;
    if (fp > prev) byUid.set(r.uid, fp);
  }

  const pool = `lesson:${lesson}`;
  const involved = Array.from(byUid.keys());

  // Ensure baseline rating row for current user
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
          [
            {
              uid,
              pool,
              rating: BASE_RATING.rating,
              rd: BASE_RATING.rd,
              vol: BASE_RATING.vol,
              last_period: dateStr(new Date()),
            },
          ],
          { onConflict: "uid,pool" }
        );
      if (baseUpsert.error) console.warn("player_ratings baseline upsert error:", baseUpsert.error.message);

      // Seed an event (before == after)
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
        opponents: [] as Array<unknown>,
      });
      if (seedEvent.error) console.warn("rating_events seed insert error:", seedEvent.error.message);
    }
  }

  // Compute and persist only *my* update (RLS-safe). Others can be done by a service-role job.
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
      current[u] = row
        ? { rating: Number(row.rating), rd: Number(row.rd), vol: Number(row.vol) }
        : { ...BASE_RATING };
    }

    const pairwise = pairwiseFromScores(byUid); // [{ uid, opponents: [{ opp, score, opp_score, outcome }] }]

    // find my entry
    const meEntry = pairwise.find((e) => e.uid === uid);
    if (meEntry && meEntry.opponents.length) {
      const before = current[uid] ?? { ...BASE_RATING };
      const after = glicko2Update(
        before,
        meEntry.opponents.map((o) => ({
          rating: current[o.opp].rating,
          rd: current[o.opp].rd,
          outcome: o.outcome,
        }))
      );

      // Upsert my rating
      const up = await supabase
        .from("player_ratings")
        .upsert(
          [
            {
              uid,
              pool,
              rating: after.rating,
              rd: after.rd,
              vol: after.vol,
              last_period: dateStr(new Date()),
            },
          ],
          { onConflict: "uid,pool" }
        );
      if (up.error) console.warn("player_ratings upsert error:", up.error.message);

      // Event for me
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
