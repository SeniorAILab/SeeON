// =============================================================
// API 클라이언트 추상화
// 현재는 USE_MOCK=true 로 인메모리 데이터를 사용한다.
// 실제 백엔드 도입 시:
//   1) VITE_USE_MOCK=false, VITE_API_BASE_URL 설정
//   2) request() 가 fetch 로 동작 (이미 구현되어 있음)
//   3) 각 service 파일의 mock 분기만 제거하면 됨
// =============================================================

export const USE_MOCK =
  (import.meta.env.VITE_USE_MOCK ?? "true").toString() !== "false";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

/** 실제 백엔드 연동 시 사용할 fetch 래퍼 */
export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const credentials: RequestCredentials | undefined =
    options.credentials ?? (!USE_MOCK ? "include" : undefined);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    ...(credentials ? { credentials } : {}),
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
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
