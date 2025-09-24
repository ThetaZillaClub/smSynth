// lib/training/prime.ts
export async function primeTrainingSession(modelId: string) {
  // 1) Ask server to set the httpOnly cookie
  await fetch("/api/session/active-student", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: modelId }),
  }).catch(() => { /* swallow; not fatal */ });

  // 2) Warm the browser cache with the student row (private, max-age=30)
  // If you always navigate with a specific id, prefer that endpoint:
  await fetch(`/api/students/${encodeURIComponent(modelId)}`, {
    credentials: "include",
    // default caching behavior will store the response with Cache-Control headers
  }).catch(() => { /* swallow; still OK */ });

  // 3) (Optional) also warm "current" if your training screen sometimes calls it
  await fetch(`/api/students/current`, { credentials: "include" }).catch(() => {});
}
