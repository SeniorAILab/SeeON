import { getCurrentFacilityId } from "@/store/facilityStore";

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

export const USE_MOCK =
  import.meta.env.VITE_USE_MOCK?.toString() === "true";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const SSE_PATH = "/dashboard/stream";
const FACILITY_SCOPE_HEADER = "X-Facility-Id";
const FACILITY_SCOPE_QUERY = "facilityId";

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function buildSseUrl(
  facilityId: string | null = getCurrentFacilityId(),
): string {
  const url = buildApiUrl(SSE_PATH);
  const params = new URLSearchParams();
  if (facilityId) params.set(FACILITY_SCOPE_QUERY, facilityId);
  const query = params.toString();
  return query ? `${url}?${query}` : url;
}

export function isAbsoluteApiUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export async function requestJson(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const credentials: RequestCredentials | undefined =
    options.credentials ?? (!USE_MOCK ? "include" : undefined);
  const res = await fetch(buildApiUrl(path), {
    ...options,
    ...(credentials ? { credentials } : {}),
    headers: requestHeaders({ "Content-Type": "application/json" }, options.headers, credentials),
  });
  handleUnauthorized(res.status);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  return res.json();
}

export async function requestNoContent(
  path: string,
  options: RequestInit = {}
): Promise<void> {
  const credentials: RequestCredentials | undefined =
    options.credentials ?? (!USE_MOCK ? "include" : undefined);
  const res = await fetch(buildApiUrl(path), {
    ...options,
    ...(credentials ? { credentials } : {}),
    headers: requestHeaders({}, options.headers, credentials),
  });
  handleUnauthorized(res.status);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
}

function requestHeaders(
  defaults: Record<string, string>,
  headers: HeadersInit | undefined,
  credentials: RequestCredentials | undefined,
): Record<string, string> {
  const merged = new Headers(defaults);
  new Headers(headers).forEach((value, key) => merged.set(key, value));

  const facilityId = getCurrentFacilityId();
  if (facilityId && credentials !== "omit" && !merged.has(FACILITY_SCOPE_HEADER)) {
    merged.set(FACILITY_SCOPE_HEADER, facilityId);
  }

  return Object.fromEntries(merged.entries());
}

function handleUnauthorized(status: number): void {
  if (status !== 401) return;
  unauthorizedHandler?.();
}
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
