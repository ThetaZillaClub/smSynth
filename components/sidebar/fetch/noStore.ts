// Simple no-store JSON fetch
export async function fetchJsonNoStore<T = unknown>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    if (data === null) return null;
    return data as T;
  } catch {
    return null;
  }
}
