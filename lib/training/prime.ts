// lib/training/prime.ts
async function fetchJsonNoStore<T = unknown>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    return (data as T) ?? null;
  } catch {
    return null;
  }
}

/**
 * Warm the data needed for training. If `studentId` is omitted, derive it
 * from /api/students/current (single-student model). All requests are no-store.
 */
export async function primeTrainingSession(studentId?: string): Promise<void> {
  if (!studentId) {
    const row = await fetchJsonNoStore<{ id?: string }>("/api/students/current");
    studentId = row?.id ?? undefined;
  }
  if (!studentId) return;

  await fetchJsonNoStore(`/api/students/${encodeURIComponent(studentId)}`).catch(() => {});
  await fetchJsonNoStore(`/api/students/current`).catch(() => {});
}
