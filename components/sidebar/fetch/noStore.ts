// Simple no-store JSON fetch
export async function fetchJsonNoStore<T = any>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}
