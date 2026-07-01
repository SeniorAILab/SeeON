import type { Role, User } from "@/types";

export const ADMIN_HOME_PATH = "/admin/dashboard";
export const STAFF_HOME_PATH = "/now";

export type RoleCapability = "alertAcknowledge" | "facilityAdmin";

type RolePolicy = {
  readonly label: string;
  readonly rank: number;
  readonly defaultPath: string;
  readonly capabilities: readonly RoleCapability[];
};

const ROLE_POLICY: Record<Role, RolePolicy> = {
  SUPER_ADMIN: {
    label: "시스템 관리자",
    rank: 3,
    defaultPath: ADMIN_HOME_PATH,
    capabilities: ["alertAcknowledge", "facilityAdmin"],
  },
  ADMIN: {
    label: "원장님",
    rank: 2,
    defaultPath: ADMIN_HOME_PATH,
    capabilities: ["alertAcknowledge", "facilityAdmin"],
  },
  STAFF: {
    label: "요양보호사",
    rank: 1,
    defaultPath: STAFF_HOME_PATH,
    capabilities: ["alertAcknowledge"],
  },
};

export function roleLabel(role: Role): string {
  return ROLE_POLICY[role].label;
}

export function defaultPathForRole(role: Role): string {
  return ROLE_POLICY[role].defaultPath;
}

export function defaultPathForUser(user: User): string {
  return defaultPathForRole(user.role);
}

export function forbiddenPathForUser(_user: User): string {
  return STAFF_HOME_PATH;
}

export function canAccessRole(role: Role, min: Role): boolean {
  return ROLE_POLICY[role].rank >= ROLE_POLICY[min].rank;
}

export function hasRole(user: User | null, min: Role): boolean {
  return user ? canAccessRole(user.role, min) : false;
}

export function hasRoleCapability(
  role: Role,
  capability: RoleCapability
): boolean {
  return ROLE_POLICY[role].capabilities.includes(capability);
}

export function userHasRoleCapability(
  user: User | null,
  capability: RoleCapability
): boolean {
  return user ? hasRoleCapability(user.role, capability) : false;
}

export function canAcknowledge(user: User | null): boolean {
  return userHasRoleCapability(user, "alertAcknowledge");
}

export function canAdmin(user: User | null): boolean {
  return userHasRoleCapability(user, "facilityAdmin");
}
