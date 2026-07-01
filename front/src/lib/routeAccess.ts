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

function dashboardFacilityPath(facilityId: string): string {
  return `${DASHBOARD_HOME_PATH}/facilities/${segment(facilityId)}`;
}

export function dashboardAdminPath(facilityId: string): string {
  return `${dashboardFacilityPath(facilityId)}/admin`;
}

export function dashboardStaffPath(facilityId: string): string {
  return `${dashboardFacilityPath(facilityId)}/staff`;
}

export function dashboardStaffRoomsPath(facilityId: string): string {
  return `${dashboardStaffPath(facilityId)}/rooms`;
}

export function dashboardStaffAlertsPath(facilityId: string): string {
  return `${dashboardStaffPath(facilityId)}/alerts`;
}

export function monitorHomePath(facilityId: string): string {
  return `/monitor/${segment(facilityId)}`;
}

export function monitorFloorPath(facilityId: string, floorId: string): string {
  return `${monitorHomePath(facilityId)}/floors/${segment(floorId)}`;
}

export function defaultPathForRole(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return DASHBOARD_HOME_PATH;
    case "FACILITY_ADMIN":
      return ONBOARDING_PATH;
    case "STAFF":
    case "VIEWER":
      return ACCESS_DENIED_PATH;
    default:
      return assertNever(role);
  }
}

export function defaultPathForUser(user: User): string {
  switch (user.role) {
    case "SUPER_ADMIN":
      return DASHBOARD_HOME_PATH;
    case "FACILITY_ADMIN":
      return user.facilityId
        ? dashboardAdminPath(user.facilityId)
        : ONBOARDING_PATH;
    case "STAFF":
    case "VIEWER":
      return user.facilityId
        ? dashboardStaffPath(user.facilityId)
        : ACCESS_DENIED_PATH;
    default:
      return assertNever(user.role);
  }
}

export function forbiddenPathForUser(_user: User): string {
  return ACCESS_DENIED_PATH;
}
