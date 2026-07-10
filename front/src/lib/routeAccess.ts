import type { Role, User } from "@/types";

export const FACILITIES_PICKER_PATH = "/facilities";
export const ACCESS_DENIED_PATH = "/access-denied";
export const ONBOARDING_PATH = "/onboarding";

function assertNever(value: never): never {
  throw new Error(`Unhandled role: ${value}`);
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

export function facilityRootPath(facilityId: string): string {
  return `/facilities/${segment(facilityId)}`;
}

export function dashboardPath(facilityId: string): string {
  return `${facilityRootPath(facilityId)}/dashboard`;
}
export function floorSelectPath(facilityId: string): string {
  return `${facilityRootPath(facilityId)}/floors`;
}

export function floorPath(facilityId: string, floorId: string): string {
  return `${facilityRootPath(facilityId)}/floor/${segment(floorId)}`;
}

export function alertsPath(facilityId: string): string {
  return `${facilityRootPath(facilityId)}/alerts`;
}

export function adminPath(facilityId: string, path = ""): string {
  const suffix = path.replace(/^\/+/, "");
  return suffix ? `${facilityRootPath(facilityId)}/admin/${suffix}` : `${facilityRootPath(facilityId)}/admin`;
}

export function defaultPathForRole(role: Role, facilityId?: string | null): string {
  switch (role) {
    case "SUPER_ADMIN":
      return facilityId ? dashboardPath(facilityId) : FACILITIES_PICKER_PATH;
    case "ADMIN":
      return facilityId ? dashboardPath(facilityId) : FACILITIES_PICKER_PATH;
    case "STAFF":
      return facilityId ? floorSelectPath(facilityId) : ACCESS_DENIED_PATH;
    default:
      return assertNever(role);
  }
}

export function defaultPathForUser(user: User): string {
  switch (user.role) {
    case "SUPER_ADMIN":
      return FACILITIES_PICKER_PATH;
    case "ADMIN":
      return user.facilityId ? dashboardPath(user.facilityId) : ONBOARDING_PATH;
    case "STAFF":
      return user.facilityId ? floorSelectPath(user.facilityId) : ACCESS_DENIED_PATH;
    default:
      return assertNever(user.role);
  }
}

export function forbiddenPathForUser(_user: User): string {
  return ACCESS_DENIED_PATH;
}
