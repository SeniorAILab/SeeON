export const USE_MOCK =
  import.meta.env.VITE_USE_MOCK?.toString() === "true";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const SSE_PATH = "/dashboard/stream";


interface ApiClientOptions {
  apiPrefix?: boolean;
}

export function buildApiUrl(
  path: string,
  { apiPrefix = true }: ApiClientOptions = {}
): string {
  const base = apiPrefix ? API_BASE_URL : API_BASE_URL.replace(/\/api(?:\/v\d+)?\/?$/, "");
  return `${base}${path}`;
}

export function buildSseUrl(): string {
  return buildApiUrl(SSE_PATH);
}

export function isAbsoluteApiUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export async function requestJson(
  path: string,
  options: RequestInit = {},
  clientOptions?: ApiClientOptions
): Promise<unknown> {
  const credentials: RequestCredentials | undefined =
    options.credentials ?? (!USE_MOCK ? "include" : undefined);
  const res = await fetch(buildApiUrl(path, clientOptions), {
    ...options,
    ...(credentials ? { credentials } : {}),
    headers: {
      "Content-Type": "application/json",
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
  const credentials: RequestCredentials | undefined =
    options.credentials ?? (!USE_MOCK ? "include" : undefined);
  const res = await fetch(buildApiUrl(path, clientOptions), {
    ...options,
    ...(credentials ? { credentials } : {}),
    headers: {
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
