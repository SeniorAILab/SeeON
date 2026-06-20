// Auth 서비스 (mock). 실제: POST /api/auth/login, /logout, GET /api/auth/me
import { db } from "./db";
import { setAuthToken } from "./apiClient";
import { delay } from "@/lib/utils";
import type { AuthSession, User } from "@/types";

const STORAGE_KEY = "senai.session";

function publicUser(u: User & { password?: string }): User {
  const { password: _pw, ...rest } = u as User & { password?: string };
  return rest;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthSession> {
    const found = db.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
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

  async logout(): Promise<void> {
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
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
