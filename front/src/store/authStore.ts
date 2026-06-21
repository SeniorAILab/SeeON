import { create } from "zustand";
import { authService } from "@/services/authService";
import type { Role, User } from "@/types";

interface AuthState {
  user: User | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  init: () => void;
  login: (email: string, password: string) => Promise<void>;
  kakaoLogin: () => Promise<User>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  loading: false,
  error: null,

  init: () => {
    const session = authService.restore();
    set({ user: session?.user ?? null, initialized: true });
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const session = await authService.login(email, password);
      set({ user: session.user, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  kakaoLogin: async () => {
    set({ loading: true, error: null });
    try {
      const session = await authService.kakaoLogin();
      set({ user: session.user, loading: false });
      return session.user;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  logout: async () => {
    await authService.logout();
    set({ user: null });
  },
}));

// 권한 헬퍼 ----------------------------------------------------
const order: Record<Role, number> = {
  VIEWER: 0,
  STAFF: 1,
  FACILITY_ADMIN: 2,
  SUPER_ADMIN: 3,
};

export function hasRole(user: User | null, min: Role): boolean {
  if (!user) return false;
  return order[user.role] >= order[min];
}

export function canAcknowledge(user: User | null): boolean {
  return hasRole(user, "STAFF");
}

export function canAdmin(user: User | null): boolean {
  return hasRole(user, "FACILITY_ADMIN");
}
