// lib/session/prime.ts
/**
 * Prime the active student context WITHOUT blocking navigation.
 * - Sets the httpOnly cookie via POST (sendBeacon/keepalive when possible)
 * - Warms useful reads in parallel
 *
 * This function intentionally does not await network calls.
 */
export function primeActiveStudent(modelId: string) {
  if (!modelId) return;

  // 1) Set cookie on the server (non-blocking)
  try {
    const payload = JSON.stringify({ id: modelId });

    // Prefer sendBeacon when available (fires during nav reliably)
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([payload], { type: "application/json" });
      // Note: some runtimes require absolute path to same-origin endpoint; relative is fine in Next.
      navigator.sendBeacon("/api/session/active-student", blob);
    } else {
      // Fallback: keepalive fetch (doesn't block unload)
      // No await on purpose.
      fetch("/api/session/active-student", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: payload,
        // keepalive lets the request continue during navigation
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}

  // 2) Warm relevant reads (non-blocking)
  try {
    fetch(`/api/students/${encodeURIComponent(modelId)}`, {
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
  } catch {}
  try {
    fetch("/api/students/current", {
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
