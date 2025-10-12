// app/api/lessons/[lesson]/results/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TakeScore } from "@/utils/scoring/score";
import { glicko2Update, type GlickoRating, pairwiseFromScores } from "@/lib/rating/glicko2";

const BASE_RATING: GlickoRating = { rating: 1500, rd: 350, vol: 0.06 };
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(req: Request, ctx: { params: Promise<{ lesson: string }> }) {
  const { lesson } = await ctx.params;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
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
      final_letter: s.final.letter as any,

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

  const resultId = inserted!.id;

  // 1a) Insert child-table details (best-effort; do not fail the request)
  // Pitch notes
  try {
    const pitchRows =
      (s.pitch.perNote ?? [])
        .filter((p: any) => Number.isFinite(p?.midi))
        .map((p: any) => ({
          result_id: resultId,
          midi: Math.round(Number(p.midi)),
          n: Math.max(1, Math.round(Number(p.n ?? 1))),
          ratio: Number(p.ratio ?? 0),
          cents_mae: Number(p.centsMae ?? 0),
        })) ?? [];

    if (pitchRows.length) {
      const { error } = await supabase.from("lesson_result_pitch_notes").insert(pitchRows);
      if (error) console.warn("pitch_notes insert error:", error.message);
    }
  } catch (e: any) {
    console.warn("pitch_notes insert exception:", e?.message || e);
  }

  // Melody per-note
  try {
    const melRows =
      (s.rhythm.perNoteMelody ?? []).map((r: any, i: number) => ({
        result_id: resultId,
        idx: i,
        coverage: Number(r.coverage ?? 0),
        onset_err_ms: Number.isFinite(r.onsetErrMs) ? Math.round(Number(r.onsetErrMs)) : null,
      })) ?? [];

    if (melRows.length) {
      const { error } = await supabase.from("lesson_result_melody_per_note").insert(melRows);
      if (error) console.warn("melody_per_note insert error:", error.message);
    }
  } catch (e: any) {
    console.warn("melody_per_note insert exception:", e?.message || e);
  }

  // Rhythm line per-event
  try {
    const lineRows =
      (s.rhythm.linePerEvent ?? []).map((r: any) => ({
        result_id: resultId,
        value: String(r.value ?? "unknown"),
        n: Math.max(1, Math.round(Number(r.n ?? 1))),
        credit: Number(r.credit ?? 0),
        err_ms: Number.isFinite(r.errMs) ? Math.round(Number(r.errMs)) : null,
      })) ?? [];

    if (lineRows.length) {
      const { error } = await supabase.from("lesson_result_rhythm_per_event").insert(lineRows);
      if (error) console.warn("rhythm_per_event insert error:", error.message);
    }
  } catch (e: any) {
    console.warn("rhythm_per_event insert exception:", e?.message || e);
  }

  // Interval classes
  try {
    const icRows =
      (s.intervals.classes ?? []).map((c: any) => ({
        result_id: resultId,
        semitones: Math.round(Number(c.semitones ?? 0)),
        attempts: Math.max(0, Math.round(Number(c.attempts ?? 0))),
        correct: Math.max(0, Math.round(Number(c.correct ?? 0))),
      })) ?? [];

    if (icRows.length) {
      const { error } = await supabase.from("lesson_result_interval_classes").insert(icRows);
      if (error) console.warn("interval_classes insert error:", error.message);
    }
  } catch (e: any) {
    console.warn("interval_classes insert exception:", e?.message || e);
  }

  // 2) Upsert per-lesson best
  const { data: currentBest } = await supabase
    .from("lesson_bests")
    .select("result_id, final_percent, created_at")
    .eq("uid", uid)
    .eq("lesson_slug", lesson)
    .maybeSingle();

  const isBetter =
    !currentBest ||
    Number(inserted!.final_percent) > Number((currentBest as any).final_percent) ||
    Number(inserted!.final_percent) === Number((currentBest as any).final_percent);

  if (isBetter) {
    const up = await supabase
      .from("lesson_bests")
      .upsert({
        uid,
        lesson_slug: lesson,
        result_id: resultId,
        final_percent: inserted!.final_percent,
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
  const { data: todaysBests, error: qErr } = await supabase
    .from("lesson_results")
    .select("uid, final_percent")
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString())
    .eq("lesson_slug", lesson);

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const byUid = new Map<string, number>();
  for (const r of todaysBests ?? []) {
    const fp = Number((r as any).final_percent);
    const prev = byUid.get((r as any).uid) ?? -Infinity;
    if (fp > prev) byUid.set((r as any).uid, fp);
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
        opponents: [],
      });
      if (seedEvent.error) console.warn("rating_events seed insert error:", seedEvent.error.message);
    }
  }

  // Compute and persist only *my* update (RLS-safe). Others can be done by a service-role job.
  if (involved.length >= 2) {
    const { data: ratingRows } = await supabase
      .from("player_ratings")
      .select("uid, rating, rd, vol")
      .in("uid", involved)
      .eq("pool", pool);

    const current: Record<string, GlickoRating> = {};
    for (const u of involved) {
      const row = ratingRows?.find((r) => (r as any).uid === u);
      current[u] = row
        ? { rating: Number((row as any).rating), rd: Number((row as any).rd), vol: Number((row as any).vol) }
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
