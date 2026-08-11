import { getCurrentFacilityId } from "@/stores/facilityStore";

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const SSE_PATH = "/dashboard/stream";
const FACILITY_SCOPE_HEADER = "X-Facility-Id";
const FACILITY_SCOPE_QUERY = "facilityId";

const GLOBAL_ENDPOINT_PATTERNS = [
  /^\/auth\/me(?:\?|$)/,
  /^\/facilities(?:\?|$)/,
];
const FACILITY_SCOPED_PATTERNS = [
  /^\/dashboard(?:\/|\?|$)/,
  /^\/dashboards(?:\/|\?|$)/,
  /^\/alerts(?:\/|\?|$)/,
  /^\/spaces(?:\/|\?|$)/,
  /^\/floors(?:\/|\?|$)/,
  /^\/users(?:\/|\?|$)/,
  /^\/cameras(?:\/|\?|$)/,
  // `/facilities` 목록은 글로벌(무스코프), `/facilities/:id` 단건은 시설 스코프.
  // super_admin은 이 헤더 없이는 단건 조회가 403이라 현황판 로딩이 멈춘다.
  /^\/facilities\/./,
];

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
  options: RequestInit = {},
): Promise<unknown> {
  const credentials: RequestCredentials | undefined =
    options.credentials ?? "include";
  const res = await fetch(buildApiUrl(path), {
    ...options,
    ...(credentials ? { credentials } : {}),
    headers: requestHeaders(
      path,
      { "Content-Type": "application/json" },
      options.headers,
      credentials,
    ),
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
  options: RequestInit = {},
): Promise<void> {
  const credentials: RequestCredentials | undefined =
    options.credentials ?? "include";
  const res = await fetch(buildApiUrl(path), {
    ...options,
    ...(credentials ? { credentials } : {}),
    headers: requestHeaders(path, {}, options.headers, credentials),
  });
  handleUnauthorized(res.status);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
}

export async function requestResponse(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const credentials: RequestCredentials | undefined =
    options.credentials ?? "include";
  const res = await fetch(buildApiUrl(path), {
    ...options,
    ...(credentials ? { credentials } : {}),
    headers: requestHeaders(path, {}, options.headers, credentials),
  });
  handleUnauthorized(res.status);
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res;
}

function requestHeaders(
  path: string,
  defaults: Record<string, string>,
  headers: HeadersInit | undefined,
  credentials: RequestCredentials | undefined,
): Record<string, string> {
  const merged = new Headers(defaults);
  new Headers(headers).forEach((value, key) => merged.set(key, value));

  if (
    credentials !== "omit" &&
    shouldAttachFacilityScope(path) &&
    !merged.has(FACILITY_SCOPE_HEADER)
  ) {
    const facilityId = getCurrentFacilityId();
    if (facilityId) merged.set(FACILITY_SCOPE_HEADER, facilityId);
  }

  return Object.fromEntries(merged.entries());
}

function shouldAttachFacilityScope(path: string): boolean {
  if (GLOBAL_ENDPOINT_PATTERNS.some((pattern) => pattern.test(path)))
    return false;
  return FACILITY_SCOPED_PATTERNS.some((pattern) => pattern.test(path));
}

function handleUnauthorized(status: number): void {
  if (status !== 401) return;
  unauthorizedHandler?.();
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
const BACKEND_ERROR_MESSAGES: Record<string, string> = {
  "Invalid email or password": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "Email already registered": "이미 사용 중인 이메일입니다.",
};

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;

  try {
    const payload: unknown = JSON.parse(err.message);
    if (!payload || typeof payload !== "object" || !("message" in payload))
      return fallback;

    const message = payload.message;
    const backendMessage = Array.isArray(message)
      ? message
          .filter((item): item is string => typeof item === "string")
          .join(", ")
      : typeof message === "string"
        ? message
        : "";

    return (
      BACKEND_ERROR_MESSAGES[backendMessage] ?? (backendMessage || fallback)
    );
  } catch {
    return fallback;
  }
}
