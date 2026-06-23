import type { Role, User } from "@/types";

export const ADMIN_HOME_PATH = "/admin/dashboard";
export const STAFF_HOME_PATH = "/now";

function assertNever(value: never): never {
  throw new Error(`Unhandled role: ${value}`);
}

export function defaultPathForRole(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "FACILITY_ADMIN":
      return ADMIN_HOME_PATH;
    case "STAFF":
    case "VIEWER":
      return STAFF_HOME_PATH;
    default:
      return assertNever(role);
  }
}

export function defaultPathForUser(user: User): string {
  return defaultPathForRole(user.role);
}

export function forbiddenPathForUser(_user: User): string {
  return STAFF_HOME_PATH;
}
