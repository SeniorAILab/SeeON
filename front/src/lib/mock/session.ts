// Demo session + frontend role. The backend Prisma Role enum is unchanged;
// CAREGIVER is a frontend-only label. getFrontSession returns DEMO_SESSION in
// demo mode without reading cookies or calling the backend.
import { loadRole, saveRole } from "./store";
import type { DemoRole, DemoSession } from "./types";

export const DEMO_SESSION: DemoSession = {
  user: {
    id: "demo-user-caregiver-01",
    orgId: "org-happy-nogyang-01",
    role: "CAREGIVER",
    nickname: "김서연",
  },
};

export const ROLE_LABELS: Record<DemoRole, string> = {
  CAREGIVER: "요양보호사",
  OWNER: "원장",
  ADMIN: "관리자",
};

export const ROLES: DemoRole[] = ["CAREGIVER", "OWNER", "ADMIN"];

export function getDemoRole(): DemoRole {
  return loadRole() ?? "CAREGIVER";
}

export function setDemoRole(role: DemoRole): void {
  saveRole(role);
}

/** Roles that may see full guardian phone numbers (others see masked). */
export function canSeeFullPhone(role: DemoRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
