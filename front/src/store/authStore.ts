import { create } from "zustand";
import { authService } from "@/services/authService";
import type { CreateFacilityInput, LoginInput } from "@/services/authService";
import type { Role, User } from "@/types";

interface AuthState {
  user: User | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (input: LoginInput) => Promise<User>;
  kakaoLogin: () => void;
  createFacility: (input: CreateFacilityInput) => Promise<User>;
  logout: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.";
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initialized: false,
  loading: false,
  error: null,

  init: async () => {
    if (get().initialized) return;
    const session = await authService.bootstrap();
    set({ user: session?.user ?? null, initialized: true });
  },

  login: async (input) => {
    set({ loading: true, error: null });
    try {
      const session = await authService.login(input);
      set({ user: session.user, loading: false });
      return session.user;
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
      throw error;
    }
  },

  kakaoLogin: () => {
    set({ loading: true, error: null });
    try {
      authService.startKakaoLogin();
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
      throw error;
    }
  },

  createFacility: async (input) => {
    set({ loading: true, error: null });
    try {
      const session = await authService.createFacility(input);
      set({ user: session.user, loading: false });
      return session.user;
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
      throw error;
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
