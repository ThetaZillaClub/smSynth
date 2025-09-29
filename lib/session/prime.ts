// lib/session/prime.ts
/**
 * Prime the active student context WITHOUT blocking navigation.
 * - Sets the httpOnly cookie via POST (sendBeacon/keepalive when possible)
 * - Warms useful reads in parallel
 *
 * This function intentionally does not await network calls.
 */
export function primeActiveStudent(studentId: string) {
  if (!studentId) return;

  // 1) Set cookie on the server (non-blocking)
  try {
    const payload = JSON.stringify({ studentId });

    // Prefer sendBeacon when available (fires during nav reliably)
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/session/active-student", blob);
    } else {
      // Fallback: keepalive fetch (doesn't block unload)
      // No await on purpose.
      fetch("/api/session/active-student", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}

  // 2) Warm relevant reads (non-blocking)
  try {
    fetch(`/api/students/${encodeURIComponent(studentId)}`, {
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
