export async function fetchJson<T>(url: string, cookieHeader: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
