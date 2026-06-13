/**
 * Client-side fetch wrapper.
 * All paths hit /api/... which Next.js rewrites to the backend origin.
 * credentials:'include' forwards the httpOnly session cookie (same-origin).
 * 401 → hard redirect to /login.
 * 403 → session valid but no org context → redirect to /onboarding
 *       (consistent with server-side dashboard redirect; see auth/org-context.interceptor).
 *
 * Optimistic badge thresholds (probability >= 0.8 → FALL, >= 0.5 → WARNING, else NORMAL)
 * mirror the ingest/alert-writer contract in backend/src/alerts/alert-writer.service.ts.
 * Update here if the backend threshold logic changes.
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

  // 403 with a valid session means the user has no org yet → send to onboarding.
  if (res.status === 403) {
    if (typeof window !== "undefined") {
      window.location.assign("/onboarding");
    }
    throw new ApiError(403, "Forbidden");
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
