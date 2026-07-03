import type { Role, User } from "@/types";

export const DASHBOARD_HOME_PATH = "/dashboard";
export const ACCESS_DENIED_PATH = "/access-denied";
export const ONBOARDING_PATH = "/onboarding";

function assertNever(value: never): never {
  throw new Error(`Unhandled role: ${value}`);
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

export function dashboardPath(): string {
  return DASHBOARD_HOME_PATH;
}

export function floorPath(floorId: string): string {
  return `${DASHBOARD_HOME_PATH}/floor/${segment(floorId)}`;
}

export function alertsPath(): string {
  return `${DASHBOARD_HOME_PATH}/alerts`;
}

export function adminPath(path = ""): string {
  const suffix = path.replace(/^\/+/, "");
  return suffix ? `/admin/${suffix}` : "/admin";
}


export function defaultPathForRole(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
    case "STAFF":
      return DASHBOARD_HOME_PATH;
    default:
      return assertNever(role);
  }
}

export function defaultPathForUser(user: User): string {
  switch (user.role) {
    case "SUPER_ADMIN":
      return DASHBOARD_HOME_PATH;
    case "ADMIN":
      return user.facilityId ? DASHBOARD_HOME_PATH : ONBOARDING_PATH;
    case "STAFF":
      return user.facilityId ? DASHBOARD_HOME_PATH : ACCESS_DENIED_PATH;
    default:
      return assertNever(user.role);
  }
}

export function forbiddenPathForUser(_user: User): string {
  return ACCESS_DENIED_PATH;
}
