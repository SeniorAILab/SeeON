import { describe, expect, it } from "vitest";
import {
  ACCESS_DENIED_PATH,
  DASHBOARD_HOME_PATH,
  adminPath,
  alertsPath,
  dashboardPath,
  defaultPathForRole,
  defaultPathForUser,
  floorPath,
  forbiddenPathForUser,
} from "./routeAccess";
import type { User } from "@/types";

function user(role: User["role"], facilityId: string | null): User {
  return {
    id: `u-${role}`,
    name: role,
    email: `${role.toLowerCase()}@example.test`,
    role,
    facilityId,
  };
}

describe("routeAccess", () => {
  it("maps every role default entry to the polymorphic /dashboard scheme", () => {
    expect(defaultPathForRole("SUPER_ADMIN")).toBe(DASHBOARD_HOME_PATH);
    expect(defaultPathForRole("ADMIN")).toBe(DASHBOARD_HOME_PATH);
    expect(defaultPathForRole("STAFF")).toBe(DASHBOARD_HOME_PATH);
    expect(defaultPathForUser(user("SUPER_ADMIN", null))).toBe(DASHBOARD_HOME_PATH);
    expect(defaultPathForUser(user("SUPER_ADMIN", "fac-a"))).toBe(DASHBOARD_HOME_PATH);
    expect(defaultPathForUser(user("ADMIN", "fac-a"))).toBe(DASHBOARD_HOME_PATH);
    expect(defaultPathForUser(user("STAFF", "fac-a"))).toBe(DASHBOARD_HOME_PATH);
    expect(defaultPathForUser(user("ADMIN", null))).toBe("/onboarding");
    expect(defaultPathForUser(user("STAFF", null))).toBe(ACCESS_DENIED_PATH);
  });

  it("builds new URL helpers without exposing facility ids", () => {
    expect(dashboardPath()).toBe("/dashboard");
    expect(floorPath("fl-2f")).toBe("/dashboard/floor/fl-2f");
    expect(alertsPath()).toBe("/dashboard/alerts");
    expect(adminPath()).toBe("/admin");
    expect(adminPath("events/a1")).toBe("/admin/events/a1");
  });

  it("권한 거부는 직원 홈으로 숨기지 않고 접근 거부 경로로 보낸다", () => {
    expect(forbiddenPathForUser(user("STAFF", "fac-a"))).toBe(ACCESS_DENIED_PATH);
  });
});
