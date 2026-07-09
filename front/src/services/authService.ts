import {
  createFacilityEndpoint,
  loginEndpoint,
  logoutEndpoint,
  registerEndpoint,
  restoreSessionEndpoint,
} from "./api/authEndpoints";
import type { AuthSession } from "@/types";
import type {
  CreateFacilityInput,
  LoginInput,
  RegisterInput,
} from "./api/authEndpoints";

export type {
  CreateFacilityInput,
  LoginInput,
  RegisterInput,
} from "./api/authEndpoints";

export const authService = {
  async login(input: LoginInput): Promise<AuthSession> {
    return loginEndpoint(input);
  },

  async register(input: RegisterInput): Promise<AuthSession> {
    return registerEndpoint(input);
  },

  async logout(): Promise<void> {
    await logoutEndpoint();
  },

  async restoreFromBackend(): Promise<AuthSession | null> {
    try {
      return await restoreSessionEndpoint();
    } catch (error) {
      if (error instanceof Error) return null;
      throw error;
    }
  },

  async bootstrap(): Promise<AuthSession | null> {
    return this.restoreFromBackend();
  },

  async createFacility(input: CreateFacilityInput): Promise<AuthSession> {
    return createFacilityEndpoint(input);
  },
};
