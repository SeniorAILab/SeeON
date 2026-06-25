import { setAuthToken } from "./apiClient";
import {
  createFacilityEndpoint,
  kakaoLoginUrl,
  loginEndpoint,
  logoutEndpoint,
  restoreSessionEndpoint,
} from "./api/authEndpoints";
import type { AuthSession } from "@/types";
import type { CreateFacilityInput, LoginInput } from "./api/authEndpoints";

export { mapBackendRoleToFrontRole } from "./api/authEndpoints";
export type { CreateFacilityInput, LoginInput } from "./api/authEndpoints";

export const authService = {
  startKakaoLogin(): void {
    window.location.assign(kakaoLoginUrl());
  },

  async login(input: LoginInput): Promise<AuthSession> {
    const session = await loginEndpoint(input);
    setAuthToken(null);
    return session;
  },

  async logout(): Promise<void> {
    await logoutEndpoint();
    setAuthToken(null);
  },

  async restoreFromBackend(): Promise<AuthSession | null> {
    try {
      const session = await restoreSessionEndpoint();
      setAuthToken(null);
      return session;
    } catch (error) {
      if (error instanceof Error) return null;
      throw error;
    }
  },

  async bootstrap(): Promise<AuthSession | null> {
    return this.restoreFromBackend();
  },

  async createFacility(input: CreateFacilityInput): Promise<AuthSession> {
    const session = await createFacilityEndpoint(input);
    setAuthToken(null);
    return session;
  },
};
