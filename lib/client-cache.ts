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
      if (session?.user && (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
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
      // small grace window to let the session land
      const retryReady = await ensureSessionReady(supabase, 1500);
      if (!retryReady) {
        // some setups emit session a tick later—give it one micro backoff then re-check
        await sleep(150);
      }
      if (await hasSession(supabase)) {
        value = await fetchOnce();
      }
    }

    // TTL logic: keep nulls very short when the session was absent
    const stillNoSession = !(await hasSession(supabase));
    const expiry =
      value === null && (!hadSessionInitially || !readyNow) && stillNoSession
        ? now() + 900 // ~0.9s — encourages quick re-try after auth finishes
        : now() + ttlMs;

    modelCache.set(id, { v: value, exp: expiry });
    return value;
  })();

  // mark inflight for dedupe
  modelCache.set(id, { exp: now() + ttlMs, inflight: task });

  try {
    return await task;
  } finally {
    const cur = modelCache.get(id);
    if (cur) modelCache.set(id, { v: cur.v, exp: cur.exp }); // clear inflight
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
