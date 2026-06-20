// Auth 서비스 (mock). 실제: POST /api/auth/login, /logout, GET /api/auth/me
import { db } from "./db";
import { setAuthToken, USE_MOCK } from "./apiClient";
import { delay } from "@/lib/utils";
import type { AuthSession, User } from "@/types";

const STORAGE_KEY = "senai.session";

// ── Mock 카카오 로그인 identity ────────────────────────────────
// 권위 소스 = localStorage 의 versioned identity marker. db.users 는 매 로그인마다
// 이 identity 로부터 idempotent 하게 재구성(upsert)되어 split-brain 을 막는다.
const KAKAO_IDENTITY_KEY = "senai.kakaoMockIdentity";
const KAKAO_IDENTITY_VERSION = 1;
const KAKAO_MOCK_USER_ID = "u_kakao_mock";
// 이메일/비번 로그인으로는 절대 매칭되지 않는 sentinel (로그인 우회 차단).
const KAKAO_SENTINEL_PASSWORD = "__kakao_oauth_no_password__";
// mock 카카오 사용자가 바인딩될 기존 데모 시설.
const KAKAO_MOCK_FACILITY_ID = "fac_happy_nokyang";

type StoredUser = User & { password: string };

interface KakaoMockIdentity {
  version: number;
  user: StoredUser;
}

function publicUser(u: User & { password?: string }): User {
  const { password: _pw, ...rest } = u as User & { password?: string };
  return rest;
}

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

/** 권위 identity 를 localStorage 에서 읽거나(없으면 = 첫 로그인 = 가입) 새로 만든다. */
function loadOrCreateKakaoIdentity(): StoredUser {
  const raw = localStorage.getItem(KAKAO_IDENTITY_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as KakaoMockIdentity;
      if (parsed?.version === KAKAO_IDENTITY_VERSION && parsed.user?.id === KAKAO_MOCK_USER_ID) {
        return parsed.user;
      }
    } catch {
      /* 손상된 marker → 아래에서 재생성 */
    }
  }
  const user = createMockKakaoUser();
  localStorage.setItem(
    KAKAO_IDENTITY_KEY,
    JSON.stringify({ version: KAKAO_IDENTITY_VERSION, user } satisfies KakaoMockIdentity)
  );
  return user;
}

/** db.users 에 mock 카카오 사용자를 idempotent 하게 보장(upsert). */
function ensureMockKakaoUser(user: StoredUser): void {
  if (!db.facilities.some((f) => f.id === user.facilityId)) {
    throw new Error(`mock 카카오 시설(${user.facilityId})이 db.facilities 에 없습니다.`);
  }
  const idx = db.users.findIndex((u) => u.id === user.id);
  if (idx === -1) db.users.push({ ...user });
  else db.users[idx] = { ...user };
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
   * 카카오 로그인 (mock). 첫 클릭 = 가입(신규 mock 사용자 생성), 이후 = 로그인.
   *
   * ★ 실제 연동 지점(deferred) ★
   *   USE_MOCK=false 가 되면 이 함수 한 곳만 백엔드 카카오 OAuth 로 교체한다:
   *     window.location.assign(`${import.meta.env.VITE_API_BASE_URL}/auth/kakao/login`)
   *   → 백엔드 GET /auth/kakao/login → 카카오 authorize → GET /auth/kakao/callback
   *     이 httpOnly 쿠키(JWT) 세션을 설정하고 프론트로 리다이렉트. 이후 복원은
   *     GET /auth/session 으로 전환(현재 localStorage bearer 와 상이 → 보류).
   *   서버 부팅: pnpm db:up → pnpm prisma:generate → prisma:migrate → prisma:seed
   *     → pnpm dev:backend(:8080) + pnpm dev:front(:3000).
   *   (실 백엔드 OAuth 연동·쿠키 세션 restore·권한 정합은 이번 범위 밖 — 별도 이슈)
   */
  async kakaoLogin(): Promise<AuthSession> {
    if (!USE_MOCK) {
      throw new Error("실 백엔드 카카오 로그인은 아직 연동되지 않았습니다(보류).");
    }
    const user = loadOrCreateKakaoIdentity();
    ensureMockKakaoUser(user);
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
    // 카카오 identity marker 는 유지 → 재로그인 시 가입 반복 방지.
    return delay(undefined, 80);
  },

  /** 새로고침 시 세션 복원 (GET /api/auth/me 대응) */
  restore(): AuthSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as AuthSession;
      setAuthToken(session.token);
      return session;
    } catch {
      return null;
    }
  },
};
