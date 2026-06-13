/**
 * Client-side fetch wrapper.
 * All paths hit /api/... which Next.js rewrites to the backend origin.
 * credentials:'include' forwards the httpOnly session cookie (same-origin).
 * 401 → hard redirect to /login.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
    throw new ApiError(401, "Unauthenticated");
  }

  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ message: res.statusText })) as { message?: string };
    throw new ApiError(res.status, body.message ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  }
};
