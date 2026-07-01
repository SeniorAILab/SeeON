import type { Role, User } from "@/types";

export const ADMIN_HOME_PATH = "/admin/dashboard";
export const STAFF_HOME_PATH = "/now";

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "시스템 관리자",
  ADMIN: "원장님",
  STAFF: "요양보호사",
};

const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  STAFF: 1,
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

export function defaultPathForRole(role: Role): string {
  return role === "STAFF" ? STAFF_HOME_PATH : ADMIN_HOME_PATH;
}

export function defaultPathForUser(user: User): string {
  return defaultPathForRole(user.role);
}

export function forbiddenPathForUser(_user: User): string {
  return STAFF_HOME_PATH;
}

export function canAccessRole(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function hasRole(user: User | null, min: Role): boolean {
  return user ? canAccessRole(user.role, min) : false;
}

export function canAcknowledge(user: User | null): boolean {
  return user !== null;
}

export function canAdmin(user: User | null): boolean {
  return hasRole(user, "ADMIN");
}
