// lib/client-cache.ts
import type { SupabaseClient } from "@supabase/supabase-js";

type Gender = "male" | "female" | "other" | "unspecified";
type Privacy = "public" | "private";

export type ModelRow = {
  id: string;
  name: string;
  creator_display_name: string;
  privacy: Privacy;
  image_path: string | null;
  gender?: Gender;
};

type Entry<T> = {
  v?: T | null;
  exp: number;
  inflight?: Promise<T | null>;
};

const modelCache = new Map<string, Entry<ModelRow>>();
const imageCache = new Map<string, Entry<string | null>>();

// NEW: current student + current range caches (dedupe & TTL)
export type CurrentStudentRow = {
  id?: string;
  creator_display_name?: string;
  image_path?: string | null;
  gender?: Gender;
  range_low?: string | null;
  range_high?: string | null;
  updated_at?: string;
} | null;

export type CurrentRangeRow = {
  range_low: string | null;
  range_high: string | null;
} | null;

const currentStudentCache: Entry<CurrentStudentRow> = { exp: 0 };
const currentRangeCache: Entry<CurrentRangeRow> = { exp: 0 };

const now = () => Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Local-only check (no network). */
async function hasSession(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session?.user;
}

/**
 * Wait (locally) for the initial auth session to hydrate.
 * Resolves TRUE only when a user exists; times out FALSE.
 */
export async function ensureSessionReady(
  supabase: SupabaseClient,
  timeoutMs = 3500
): Promise<boolean> {
  if (await hasSession(supabase)) return true;

  return await new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (!done) {
        done = true;
        resolve(ok);
      }
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session?.user &&
        (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
      ) {
        clearTimeout(timer);
        sub.subscription.unsubscribe();
        finish(true);
      }
    });
  });
}

/**
 * Cache a model row by id.
 * - Waits for session hydration.
 * - If the first read returns null while the session is still not ready,
 *   waits a short grace window and re-fetches once when the session appears.
 * - Short TTLs for nulls to avoid poisoning the cache during auth races.
 */
export async function getModelCached(
  supabase: SupabaseClient,
  id: string,
  ttlMs = 60_000
): Promise<ModelRow | null> {
  if (!id) return null;

  const cached = modelCache.get(id);
  if (cached && cached.exp > now()) return cached.v ?? null;
  if (cached?.inflight) return cached.inflight;

  const task: Promise<ModelRow | null> = (async () => {
    const hadSessionInitially = await hasSession(supabase);
    const readyNow = await ensureSessionReady(supabase, 3500);

    const fetchOnce = async (): Promise<ModelRow | null> => {
      const { data, error } = await supabase
        .from("models")
        .select("id,name,creator_display_name,image_path,privacy")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ModelRow | null;
    };

    let value = await fetchOnce();

    // If null and we still didn't have a session, do a one-shot grace retry.
    if (value === null && !hadSessionInitially && !readyNow) {
      const retryReady = await ensureSessionReady(supabase, 1500);
      if (!retryReady) await sleep(150);
      if (await hasSession(supabase)) {
        value = await fetchOnce();
      }
    }

    // TTL logic: keep nulls very short when the session was absent
    const stillNoSession = !(await hasSession(supabase));
    const expiry =
      value === null && (!hadSessionInitially || !readyNow) && stillNoSession
        ? now() + 900
        : now() + ttlMs;

    modelCache.set(id, { v: value, exp: expiry });
    return value;
  })();

  modelCache.set(id, { exp: now() + ttlMs, inflight: task });

  try {
    return await task;
  } finally {
    const cur = modelCache.get(id);
    if (cur) modelCache.set(id, { v: cur.v, exp: cur.exp });
  }
}

/** Cache signed URL ~5m before expiry; fallback to public URL. */
export async function getImageUrlCached(
  supabase: SupabaseClient,
  imagePath: string,
  signSeconds = 60 * 60
): Promise<string | null> {
  if (!imagePath) return null;

  const early = Math.max(5 * 60, signSeconds - 5 * 60);
  const ttlMs = early * 1000;

  const cached = imageCache.get(imagePath);
  if (cached && cached.exp > now()) return cached.v ?? null;
  if (cached?.inflight) return cached.inflight;

  const task: Promise<string | null> = (async () => {
    try {
      const { data: signed, error: signErr } = await supabase
        .storage.from("model-images")
        .createSignedUrl(imagePath, signSeconds);

      if (!signErr && signed?.signedUrl) {
        const url = signed.signedUrl;
        imageCache.set(imagePath, { v: url, exp: now() + ttlMs });
        return url;
      }

      const { data: pub } = supabase.storage.from("model-images").getPublicUrl(imagePath);
      const url = pub?.publicUrl ?? null;
      imageCache.set(imagePath, { v: url, exp: now() + ttlMs });
      return url;
    } catch {
      imageCache.set(imagePath, { v: null, exp: now() + 10_000 });
      return null;
    }
  })();

  imageCache.set(imagePath, { exp: now() + ttlMs, inflight: task });

  try {
    return await task;
  } finally {
    const cur = imageCache.get(imagePath);
    if (cur) imageCache.set(imagePath, { v: cur.v, exp: cur.exp });
  }
}

/* ──────────────────────────────────────────────────────────────
   NEW: Cached helpers to collapse duplicate /api calls
   ────────────────────────────────────────────────────────────── */

/** One in-memory, inflight-deduped read of /api/students/current (TTL default 30s). */
export async function getCurrentStudentRowCached(
  supabase: SupabaseClient,
  ttlMs = 30_000
): Promise<CurrentStudentRow> {
  const valid = currentStudentCache.exp > now();
  if (valid) return currentStudentCache.v ?? null;
  if (currentStudentCache.inflight) return currentStudentCache.inflight;

  const task: Promise<CurrentStudentRow> = (async () => {
    // Wait for session so we don't get a spurious 401 from fetch()
    await ensureSessionReady(supabase, 2500);

    try {
      const res = await fetch("/api/students/current", { credentials: "include", cache: "no-store" });
      const data = res.ok ? ((await res.json().catch(() => null)) as CurrentStudentRow) : null;
      currentStudentCache.v = data ?? null;
      currentStudentCache.exp = now() + ttlMs;
      return currentStudentCache.v;
    } catch {
      currentStudentCache.v = null;
      currentStudentCache.exp = now() + 1500; // quick retry window
      return null;
    }
  })();

  currentStudentCache.inflight = task;
  try {
    return await task;
  } finally {
    currentStudentCache.inflight = undefined;
  }
}

/** One in-memory, inflight-deduped read of /api/students/current/range (TTL default 30s). */
export async function getCurrentRangeCached(
  supabase: SupabaseClient,
  ttlMs = 30_000
): Promise<CurrentRangeRow> {
  const valid = currentRangeCache.exp > now();
  if (valid) return currentRangeCache.v ?? null;
  if (currentRangeCache.inflight) return currentRangeCache.inflight;

  const task: Promise<CurrentRangeRow> = (async () => {
    await ensureSessionReady(supabase, 2500);

    try {
      const res = await fetch("/api/students/current/range", { credentials: "include", cache: "no-store" });
      const data = res.ok ? ((await res.json().catch(() => null)) as CurrentRangeRow) : null;
      currentRangeCache.v = data ?? null;
      currentRangeCache.exp = now() + ttlMs;
      return currentRangeCache.v;
    } catch {
      currentRangeCache.v = null;
      currentRangeCache.exp = now() + 1500;
      return null;
    }
  })();

  currentRangeCache.inflight = task;
  try {
    return await task;
  } finally {
    currentRangeCache.inflight = undefined;
  }
}
