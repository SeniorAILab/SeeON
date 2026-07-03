import { describe, expect, it } from "vitest";
import {
  ACCESS_DENIED_PATH,
  FACILITIES_PICKER_PATH,
  adminPath,
  alertsPath,
  dashboardPath,
  defaultPathForRole,
  defaultPathForUser,
  facilityRootPath,
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
  it("maps defaults into the facility-scoped URL scheme", () => {
    expect(defaultPathForRole("SUPER_ADMIN")).toBe(FACILITIES_PICKER_PATH);
    expect(defaultPathForRole("SUPER_ADMIN", "fac-a")).toBe("/facilities/fac-a/dashboard");
    expect(defaultPathForRole("ADMIN", "fac-a")).toBe("/facilities/fac-a/dashboard");
    expect(defaultPathForRole("STAFF", "fac-a")).toBe("/facilities/fac-a/dashboard");
    expect(defaultPathForUser(user("SUPER_ADMIN", null))).toBe(FACILITIES_PICKER_PATH);
    expect(defaultPathForUser(user("SUPER_ADMIN", "fac-a"))).toBe(FACILITIES_PICKER_PATH);
    expect(defaultPathForUser(user("ADMIN", "fac-a"))).toBe("/facilities/fac-a/dashboard");
    expect(defaultPathForUser(user("STAFF", "fac-a"))).toBe("/facilities/fac-a/dashboard");
    expect(defaultPathForUser(user("ADMIN", null))).toBe("/onboarding");
    expect(defaultPathForUser(user("STAFF", null))).toBe(ACCESS_DENIED_PATH);
  });

  it("builds cuid facility id scoped URL helpers", () => {
    expect(facilityRootPath("fac_happy_nokyang")).toBe("/facilities/fac_happy_nokyang");
    expect(dashboardPath("fac_happy_nokyang")).toBe("/facilities/fac_happy_nokyang/dashboard");
    expect(floorPath("fac_happy_nokyang", "fl-2f")).toBe("/facilities/fac_happy_nokyang/floor/fl-2f");
    expect(alertsPath("fac_happy_nokyang")).toBe("/facilities/fac_happy_nokyang/alerts");
    expect(adminPath("fac_happy_nokyang")).toBe("/facilities/fac_happy_nokyang/admin");
    expect(adminPath("fac_happy_nokyang", "events/a1")).toBe("/facilities/fac_happy_nokyang/admin/events/a1");
  });

  it("권한 거부는 직원 홈으로 숨기지 않고 접근 거부 경로로 보낸다", () => {
    expect(forbiddenPathForUser(user("STAFF", "fac-a"))).toBe(ACCESS_DENIED_PATH);
  });
});
