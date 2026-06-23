export const USE_MOCK =
  (import.meta.env.VITE_USE_MOCK ?? "true").toString() !== "false";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

interface ApiClientOptions {
  apiPrefix?: boolean;
}

export function buildApiUrl(
  path: string,
  { apiPrefix = true }: ApiClientOptions = {}
): string {
  const base = apiPrefix ? API_BASE_URL : API_BASE_URL.replace(/\/api\/?$/, "");
  return `${base}${path}`;
}

export async function requestJson(
  path: string,
  options: RequestInit = {},
  clientOptions?: ApiClientOptions
): Promise<unknown> {
  const res = await fetch(buildApiUrl(path, clientOptions), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  return res.json();
}

export async function requestNoContent(
  path: string,
  options: RequestInit = {},
  clientOptions?: ApiClientOptions
): Promise<void> {
  const res = await fetch(buildApiUrl(path, clientOptions), {
    ...options,
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
