// lib/client-cache.ts

/**
 * Small client-side cache utilities used across the dashboard.
 * - ensureSessionReady: waits briefly for Supabase auth to hydrate
 * - getCurrentStudentRowCached: in-flight deduped fetch of /api/students/current with short TTL
 * - getImageUrlCached: resolves storage path -> URL with caching & in-flight dedupe
 */

type SupabaseLike = {
  auth: {
    getSession: () => Promise<{ data: { session: any | null } }>;
    onAuthStateChange: (cb: (evt: string, session: any | null) => void) => { data: { subscription: { unsubscribe: () => void } } };
  };
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: any | null }>;
    };
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait up to `timeoutMs` for a session to exist (for RLS). If none appears,
 * resolve anyway so callers can keep going. Never throws.
 */
export async function ensureSessionReady(supabase: SupabaseLike, timeoutMs = 2000): Promise<void> {
  const start = Date.now();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return;
  } catch {}

  let done = false;
  const sub = supabase.auth.onAuthStateChange((_evt, session) => {
    if (session && !done) done = true;
  });

  while (!done && Date.now() - start < timeoutMs) {
    await sleep(50);
  }

  try { sub.data.subscription.unsubscribe(); } catch {}
}

/* ───────────────────────── current student row ───────────────────────── */

export type CurrentStudentRow = {
  id: string;
  creator_display_name: string | null;
  image_path: string | null;
  range_low: string | null;
  range_high: string | null;
  updated_at: string | null;
} | null;

let __rowValue: CurrentStudentRow = null;
let __rowTs = 0;
let __rowInflight: Promise<CurrentStudentRow> | null = null;
const ROW_TTL_MS = 30_000;

export async function getCurrentStudentRowCached(
  _supabase: SupabaseLike,
  opts?: { force?: boolean }
): Promise<CurrentStudentRow> {
  const now = Date.now();
  if (!opts?.force && __rowValue && now - __rowTs < ROW_TTL_MS) {
    return __rowValue;
  }
  if (__rowInflight) return __rowInflight;

  __rowInflight = (async () => {
    const res = await fetch('/api/students/current', { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      __rowInflight = null;
      throw new Error(`current student ${res.status}`);
    }
    const row = (await res.json()) as CurrentStudentRow;
    __rowValue = row;
    __rowTs = Date.now();
    __rowInflight = null;
    return row;
  })();

  return __rowInflight;
}

export function patchCurrentStudentRow(partial: Partial<NonNullable<CurrentStudentRow>>): void {
  if (!__rowValue) return;
  __rowValue = { ...__rowValue, ...partial };
}

export function invalidateCurrentStudentRow(): void {
  __rowValue = null;
  __rowTs = 0;
  __rowInflight = null;
}

/* ───────────────────────── image url resolver ───────────────────────── */

const ABS_URL = /^https?:\/\//i;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAbsoluteUrl(x: string) { return ABS_URL.test(x); }

// cache entry for image URLs
type ImgCacheEntry = { url: string; ts: number; ttl: number };
const __imgCache = new Map<string, ImgCacheEntry>();
const __imgInflight = new Map<string, Promise<string>>();

const DEFAULT_SIGNED_TTL_S = 900; // 15 minutes

type GetImageUrlOpts = {
  /** When the path is missing a bucket (e.g. "uid/file.jpg"), prefix this. */
  defaultBucket?: string;          // <- we'll pass "model-images" from callers
  /** Signed URL lifetime (seconds). */
  signedTtlSec?: number;
};

/**
 * Resolve a storage path to a usable URL.
 * - Absolute URLs → returned as-is.
 * - "bucket/key/…" → use that bucket.
 * - "uid/file" → assume `defaultBucket` (we pass "model-images").
 * - Always try a SIGNED URL first (works for private/public), then fall back to public URL.
 * - Caches + in-flight dedupe.
 */
export async function getImageUrlCached(
  supabase: SupabaseLike,
  rawPath: string,
  opts?: GetImageUrlOpts
): Promise<string> {
  if (!rawPath) return '';

  // normalize (strip leading slash)
  const normalized = rawPath.replace(/^\/+/, '');
  if (isAbsoluteUrl(normalized)) return normalized;

  // serve from cache if fresh
  const now = Date.now();
  const hit = __imgCache.get(normalized);
  if (hit && now - hit.ts < hit.ttl) return hit.url;

  const inflight = __imgInflight.get(normalized);
  if (inflight) return inflight;

  const p = (async () => {
    const defBucket = opts?.defaultBucket ?? 'model-images';
    const signedTtl = Math.max(60, Math.min(60 * 60 * 24, opts?.signedTtlSec ?? DEFAULT_SIGNED_TTL_S));

    // parse bucket/key, repairing if necessary
    const slash = normalized.indexOf('/');
    let bucket: string;
    let key: string;

    if (slash <= 0) {
      // no bucket: treat the whole thing as key under default bucket
      bucket = defBucket;
      key = normalized;
    } else {
      bucket = normalized.slice(0, slash);
      key = normalized.slice(slash + 1);

      // if first segment looks like a UUID, this was probably "uid/file" → no bucket
      if (UUID_LIKE.test(bucket)) {
        key = normalized;     // keep full "uid/file"
        bucket = defBucket;   // repair to default bucket
      }
    }

    // try SIGNED (works for private/public)
    const trySigned = async (b: string, k: string) => {
      try {
        const s = await supabase.storage.from(b).createSignedUrl(k, signedTtl);
        return s?.data?.signedUrl || '';
      } catch {
        return '';
      }
    };

    // try PUBLIC
    const tryPublic = (b: string, k: string) => {
      try {
        return supabase.storage.from(b).getPublicUrl(k)?.data?.publicUrl || '';
      } catch {
        return '';
      }
    };

    // 1) preferred: signed for parsed bucket/key
    let url = await trySigned(bucket, key);

    // 1b) if that failed AND the bucket differs from default, but the key starts with a UUID
    //     (common stale hint like "avatars/uid/file"), try default bucket as a fallback
    if (!url && bucket !== defBucket) {
      const firstKeySeg = key.split('/')[0] || '';
      if (UUID_LIKE.test(firstKeySeg)) {
        url = await trySigned(defBucket, key);
      }
    }

    // 2) fallbacks to public
    if (!url) url = tryPublic(bucket, key);
    if (!url && bucket !== defBucket) url = tryPublic(defBucket, key);

    // cache (shorter TTL for public; near-expiry buffer for signed)
    const ttl = url.includes('token=') ? signedTtl * 1000 - 5_000 : 10 * 60_000;
    __imgCache.set(normalized, { url, ts: Date.now(), ttl });
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

