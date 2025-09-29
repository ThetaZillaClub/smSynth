// lib/training/prime.ts
export async function primeTrainingSession(studentId: string) {
  // 1) Ask server to set the httpOnly cookie
  await fetch("/api/session/active-student", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId }),
  }).catch(() => { /* swallow; not fatal */ });

  // 2) Warm the browser cache with the student row (private, max-age=30)
  await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
    credentials: "include",
    // default caching behavior will store the response with Cache-Control headers
  }).catch(() => { /* swallow; still OK */ });

  // 3) (Optional) also warm "current" if your training screen sometimes calls it
  await fetch(`/api/students/current`, { credentials: "include" }).catch(() => {});
}
