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

export function dashboardAdminPath(): string {
  return `${DASHBOARD_HOME_PATH}/admin`;
}

export function dashboardStaffPath(): string {
  return `${DASHBOARD_HOME_PATH}/staff`;
}

export function dashboardStaffRoomsPath(): string {
  return `${dashboardStaffPath()}/rooms`;
}

export function dashboardStaffAlertsPath(): string {
  return `${dashboardStaffPath()}/alerts`;
}

export function monitorHomePath(): string {
  return "/monitor";
}

export function monitorFloorPath(floorId: string): string {
  return `${monitorHomePath()}/floors/${segment(floorId)}`;
}

export function defaultPathForRole(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return DASHBOARD_HOME_PATH;
    case "ADMIN":
      return ONBOARDING_PATH;
    case "STAFF":
      return ACCESS_DENIED_PATH;
    default:
      return assertNever(role);
  }
}

export function defaultPathForUser(user: User): string {
  switch (user.role) {
    case "SUPER_ADMIN":
      return DASHBOARD_HOME_PATH;
    case "ADMIN":
      return user.facilityId
        ? dashboardAdminPath()
        : ONBOARDING_PATH;
    case "STAFF":
      return user.facilityId
        ? dashboardStaffPath()
        : ACCESS_DENIED_PATH;
    default:
      return assertNever(user.role);
  }
}

export function forbiddenPathForUser(_user: User): string {
  return ACCESS_DENIED_PATH;
}
