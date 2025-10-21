// lib/client-cache.ts

/**
 * Client-side cache utilities shared across the app:
 *  • ensureSessionReady: wait briefly for Supabase auth to hydrate on the client
 *  • getCurrentStudentRowCached: fetch/cache the current student's row (short TTL + in-flight dedupe)
 *  • getImageUrlCached: resolve a Supabase Storage path -> URL (signed preferred, public fallback) with caching
 *
 * Notes:
 *  - No `any` is used.
 *  - Uses a structural `SupabaseLike` type so your Supabase client (with any generics) is assignable.
 *  - Signed URLs are preferred; public URL is the fallback.
 */

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

/* ───────────────────────── Supabase-like structural type ───────────────────────── */

type Unsubscribable = { unsubscribe: () => void };

type SupabaseLike = {
  auth: {
    getSession: () => Promise<{ data: { session: Session | null } }>;
    onAuthStateChange: (
      cb: (evt: AuthChangeEvent, session: Session | null) => void
    ) => { data: { subscription: Unsubscribable } };
  };
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      createSignedUrl: (
        path: string,
        expiresIn: number
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};

/* ───────────────────────── small helpers ───────────────────────── */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ───────────────────────── ensureSessionReady ───────────────────────── */

/**
 * Wait up to `timeoutMs` for a client session to exist so that RLS queries won’t 401.
 * Will resolve early as soon as a session is seen. Never throws.
 */
export async function ensureSessionReady(
  supabase: SupabaseLike,
  timeoutMs = 2000
): Promise<void> {
  const start = Date.now();

  // Quick first check
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
  } catch {
    // ignore; we'll rely on the event / timer loop below
  }

  let resolved = false;

  // Subscribe to auth changes to resolve early when the client hydrates
  const sub = supabase.auth.onAuthStateChange(
    (_evt: AuthChangeEvent, s: Session | null) => {
      if (s) resolved = true;
    }
  );

  // Loop until session arrives or timeout elapses
  while (!resolved && Date.now() - start < timeoutMs) {
    await sleep(80);
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        resolved = true;
        break;
      }
    } catch {
      // ignore
    }
  }

  // Clean up subscription
  try {
    sub.data.subscription.unsubscribe();
  } catch {
    /* no-op */
  }
}

/* ───────────────────────── current student row ───────────────────────── */

export type CurrentStudentRow =
  | {
      id: string;
      creator_display_name: string | null;
      image_path: string | null;
      range_low: string | null;
      range_high: string | null;
      updated_at: string | null;
    }
  | null;

let __rowValue: CurrentStudentRow = null;
let __rowTs = 0;
let __rowInflight: Promise<CurrentStudentRow> | null = null;

const ROW_TTL_MS = 30_000; // 30s

/**
 * Returns the current user's student row (cached with short TTL and in-flight dedupe).
 * If not authenticated, returns null immediately without calling the API.
 */
export async function getCurrentStudentRowCached(
  supabase: SupabaseLike,
  opts?: { force?: boolean }
): Promise<CurrentStudentRow> {
  // Don’t hit the API if we’re not logged in
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      __rowValue = null;
      __rowTs = 0;
      __rowInflight = null;
      return null;
    }
  } catch {
    // If the session check itself fails, fall through to fetch (server may still have a cookie)
  }

  const now = Date.now();

  if (!opts?.force && __rowValue && now - __rowTs < ROW_TTL_MS) {
    return __rowValue;
  }
  if (__rowInflight) return __rowInflight;

  __rowInflight = (async () => {
    const res = await fetch("/api/students/current", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      __rowInflight = null;
      // Do not cache errors; just bubble a null row to callers
      return null;
    }

    const row = (await res.json()) as CurrentStudentRow;

    __rowValue = row ?? null;
    __rowTs = Date.now();
    __rowInflight = null;
    return __rowValue;
  })();

  return __rowInflight;
}

/** Patch the cached student row locally (handy after optimistic UI updates). */
export function patchCurrentStudentRow(
  partial: Partial<NonNullable<CurrentStudentRow>>
): void {
  if (!__rowValue) return;
  __rowValue = { ...__rowValue, ...partial };
}

/** Invalidate the cached student row (forces next call to refetch). */
export function invalidateCurrentStudentRow(): void {
  __rowValue = null;
  __rowTs = 0;
  __rowInflight = null;
}

/* ───────────────────────── image url resolver ───────────────────────── */

const ABS_URL = /^https?:\/\//i;
const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_SIGNED_TTL_S = 15 * 60; // 15 minutes

type ImgCacheEntry = { url: string; ts: number; ttl: number };

const __imgCache = new Map<string, ImgCacheEntry>();
const __imgInflight = new Map<string, Promise<string>>();

export type GetImageUrlOpts = {
  /**
   * When the path is missing a bucket (e.g. "uid/file.jpg"), prefix this bucket.
   * You can pass "model-images" or your preferred default.
   */
  defaultBucket?: string;
  /** Signed URL lifetime (seconds). Clamped to [60, 86400]. */
  signedTtlSec?: number;
};

function isAbsoluteUrl(x: string): boolean {
  return ABS_URL.test(x);
}

/**
 * Resolve a Supabase Storage path to a usable URL.
 *
 * Rules:
 *  - Absolute URLs are returned unchanged.
 *  - "bucket/key/..." => use that bucket.
 *  - "uid/file" (no bucket) => use `defaultBucket`.
 *  - Prefer a SIGNED URL (works for private/public), then fall back to public URL.
 *  - Caches results by normalized path with TTL; also de-dupes concurrent lookups.
 */
export async function getImageUrlCached(
  supabase: SupabaseLike,
  rawPath: string,
  opts?: GetImageUrlOpts
): Promise<string> {
  if (!rawPath) return "";

  // normalize input (strip leading slash)
  const normalized = rawPath.replace(/^\/+/, "");
  if (isAbsoluteUrl(normalized)) return normalized;

  // serve from cache if fresh
  const now = Date.now();
  const hit = __imgCache.get(normalized);
  if (hit && now - hit.ts < hit.ttl) return hit.url;

  // coalesce inflight calls
  const inflight = __imgInflight.get(normalized);
  if (inflight) return inflight;

  const p = (async (): Promise<string> => {
    const defaultBucket = opts?.defaultBucket ?? "model-images";
    const ttlSec = Math.max(
      60,
      Math.min(86_400, opts?.signedTtlSec ?? DEFAULT_SIGNED_TTL_S)
    );

    // Ensure we have a client session before attempting to sign (avoids transient empty results)
    try {
      await ensureSessionReady(supabase, 1500);
    } catch {
      /* non-fatal */
    }

    // parse "bucket/key" or repair to default bucket if first segment looks like a UUID
    const slash = normalized.indexOf("/");
    let bucket: string;
    let key: string;

    if (slash <= 0) {
      // no bucket provided; treat entire path as key under default bucket
      bucket = defaultBucket;
      key = normalized;
    } else {
      bucket = normalized.slice(0, slash);
      key = normalized.slice(slash + 1);

      // e.g., if first segment is a UUID, treat the whole thing as a key in the default bucket
      if (UUID_LIKE.test(bucket)) {
        key = normalized;
        bucket = defaultBucket;
      }
    }

    // Attempt a signed URL first (works for public/private buckets)
    async function createSignedUrl(b: string, k: string): Promise<string> {
      try {
        const { data, error } = await supabase.storage
          .from(b)
          .createSignedUrl(k, ttlSec);
        if (error || !data?.signedUrl) return "";
        return data.signedUrl;
      } catch {
        return "";
      }
    }

    // Public URL fallback
    function getPublicUrl(b: string, k: string): string {
      try {
        const { data } = supabase.storage.from(b).getPublicUrl(k);
        return data?.publicUrl ?? "";
      } catch {
        return "";
      }
    }

    // 1) Signed for parsed bucket/key
    let url = await createSignedUrl(bucket, key);

    // 1b) If that failed and the bucket differs from default, but key looks UUID-scoped,
    //     try the default bucket as a fallback.
    if (!url && bucket !== defaultBucket) {
      const firstSeg = key.split("/")[0] || "";
      if (UUID_LIKE.test(firstSeg)) {
        url = await createSignedUrl(defaultBucket, key);
      }
    }

    // 2) Public fallbacks
    if (!url) url = getPublicUrl(bucket, key);
    if (!url && bucket !== defaultBucket) url = getPublicUrl(defaultBucket, key);

    // Cache with TTL. Signed URLs get a slightly shorter TTL to avoid returning an expired token.
    const ttlMs = url.includes("token=") ? ttlSec * 1000 - 5_000 : 10 * 60_000; // 10min for public
    __imgCache.set(normalized, { url, ts: Date.now(), ttl: ttlMs });
    __imgInflight.delete(normalized);

    return url;
  })();

  __imgInflight.set(normalized, p);
  try {
    return await p;
  } finally {
    __imgInflight.delete(normalized);
  }
}

/** Clear all cached image URLs (e.g., after a user changes their avatar). */
export function invalidateImageUrlCache(): void {
  __imgCache.clear();
  __imgInflight.clear();
}
