// Auth 서비스 (mock). 실제: POST /api/auth/login, /logout, GET /api/auth/me
import { db } from "./db";
import { setAuthToken, USE_MOCK } from "./apiClient";
import { delay } from "@/lib/utils";
import type { AuthSession, User } from "@/types";

const STORAGE_KEY = "senai.session";

// ── Mock 카카오 로그인 identity ────────────────────────────────
// 권위 소스 = createMockKakaoUser() 상수. localStorage marker 는 "가입했다"는
// 사실({version,id})만 기록하고, 실제 사용자/db.users 는 매 로그인·restore 시
// 상수로부터 idempotent 하게 재구성(upsert)되어 split-brain 을 막는다.
const KAKAO_IDENTITY_KEY = "senai.kakaoMockIdentity";
const KAKAO_IDENTITY_VERSION = 1;
const KAKAO_MOCK_USER_ID = "u_kakao_mock";
// 이메일/비번 로그인으로는 절대 매칭되지 않는 sentinel (로그인 우회 차단).
const KAKAO_SENTINEL_PASSWORD = "__kakao_oauth_no_password__";
// mock 카카오 사용자가 바인딩될 기존 데모 시설.
const KAKAO_MOCK_FACILITY_ID = "fac_happy_nokyang";

type StoredUser = User & { password: string };

interface KakaoMockMarker {
  version: number;
  id: string;
}

function publicUser(u: User & { password?: string }): User {
  const { password: _pw, ...rest } = u as User & { password?: string };
  return rest;
}

/** 권위 소스: mock 카카오 사용자 상수. */
function createMockKakaoUser(): StoredUser {
  return {
    id: KAKAO_MOCK_USER_ID,
    name: "카카오 원장",
    email: "kakao.mock@sen.ai",
    role: "FACILITY_ADMIN",
    facilityId: KAKAO_MOCK_FACILITY_ID,
    password: KAKAO_SENTINEL_PASSWORD,
  };
}

/** "이미 가입함" marker 존재 여부 (첫 로그인=가입 판정용). */
function hasKakaoSignup(): boolean {
  const raw = localStorage.getItem(KAKAO_IDENTITY_KEY);
  if (!raw) return false;
  try {
    const m = JSON.parse(raw) as KakaoMockMarker;
    return m?.version === KAKAO_IDENTITY_VERSION && m.id === KAKAO_MOCK_USER_ID;
  } catch {
    return false;
  }
}

function rememberKakaoSignup(): void {
  localStorage.setItem(
    KAKAO_IDENTITY_KEY,
    JSON.stringify({ version: KAKAO_IDENTITY_VERSION, id: KAKAO_MOCK_USER_ID } satisfies KakaoMockMarker)
  );
}

/** db.users 에 mock 카카오 사용자를 상수로부터 idempotent 하게 보장(upsert). */
function ensureMockKakaoUser(): StoredUser {
  const user = createMockKakaoUser();
  if (!db.facilities.some((f) => f.id === user.facilityId)) {
    throw new Error(`mock 카카오 시설(${user.facilityId})이 db.facilities 에 없습니다.`);
  }
  const idx = db.users.findIndex((u) => u.id === user.id);
  if (idx === -1) db.users.push({ ...user });
  else db.users[idx] = { ...user };
  return user;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthSession> {
    const found = db.users.find(
      (u) =>
        // 카카오 mock 사용자는 이메일/비번 경로에서 제외(우회 차단)
        u.id !== KAKAO_MOCK_USER_ID &&
        u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (!found || found.password !== password) {
      await delay(null, 200);
      throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    const session: AuthSession = {
      user: publicUser(found),
      token: `mock-token-${found.id}`,
    };
    setAuthToken(session.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return delay(session);
  },

  /**
   * 카카오 로그인 (mock). 첫 클릭 = 가입(marker 생성), 이후 = 로그인.
   * db.users 는 상수로부터 idempotent upsert → 가입 반복/중복 없음.
   *
   * USE_MOCK=false 면 아래 분기가 백엔드 카카오 OAuth 로 위임한다.
   * 쿠키 세션 복원(GET /auth/session)·권한 정합은 별도 이슈(본 변경 범위 밖).
   */
  async kakaoLogin(): Promise<AuthSession> {
    if (!USE_MOCK) {
      const base = import.meta.env.VITE_API_BASE_URL ?? "";
      window.location.assign(`${base}/auth/kakao/login`);
      return new Promise<AuthSession>(() => {});
    }
    // 첫 클릭 = 가입(marker 없음), 이후 = 로그인. db upsert 는 멱등.
    const firstTime = !hasKakaoSignup();
    const user = ensureMockKakaoUser();
    if (firstTime) rememberKakaoSignup();
    const session: AuthSession = {
      user: publicUser(user),
      token: `mock-token-${user.id}`,
    };
    setAuthToken(session.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return delay(session);
  },

  async logout(): Promise<void> {
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
    // 카카오 가입 marker 는 유지 → 재로그인 시 가입 반복 방지.
    return delay(undefined, 80);
  },

  /** 새로고침 시 세션 복원 (GET /api/auth/me 대응) */
  restore(): AuthSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    let session: AuthSession;
    try {
      session = JSON.parse(raw) as AuthSession;
    } catch {
      return null;
    }
    // 카카오 mock 세션은 권위 소스(상수)로부터 canonicalize + db.users 재구성.
    // localStorage 의 user 필드(변조 가능)는 신뢰하지 않는다.
    if (session.user?.id === KAKAO_MOCK_USER_ID) {
      let canonical: StoredUser;
      try {
        canonical = ensureMockKakaoUser();
      } catch {
        // 재구성 불가(예: 시설 시드 없음) → stale/변조 세션 유지 금지: 폐기.
        setAuthToken(null);
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      const canonicalSession: AuthSession = {
        user: publicUser(canonical),
        token: `mock-token-${canonical.id}`,
      };
      setAuthToken(canonicalSession.token);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(canonicalSession));
      return canonicalSession;
    }
    setAuthToken(session.token);
    return session;
  },
};
