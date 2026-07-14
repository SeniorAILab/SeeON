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
  floorSelectPath,
  forbiddenPathForUser,
} from "./routeAccess";
import type { User } from "@/types";
const SCOPED_FACILITY_ID = "fac_happy_nokyang";


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
    expect(defaultPathForRole("STAFF", "fac-a")).toBe("/facilities/fac-a/floors");
    expect(defaultPathForRole("STAFF")).toBe(ACCESS_DENIED_PATH);
    expect(defaultPathForUser(user("SUPER_ADMIN", null))).toBe(FACILITIES_PICKER_PATH);
    expect(defaultPathForUser(user("SUPER_ADMIN", "fac-a"))).toBe(FACILITIES_PICKER_PATH);
    expect(defaultPathForUser(user("ADMIN", "fac-a"))).toBe("/facilities/fac-a/dashboard");
    expect(defaultPathForUser(user("STAFF", "fac-a"))).toBe("/facilities/fac-a/floors");
    expect(defaultPathForUser(user("ADMIN", null))).toBe("/onboarding");
    expect(defaultPathForUser(user("STAFF", null))).toBe(ACCESS_DENIED_PATH);
  });

  it("builds cuid facility id scoped URL helpers", () => {
    expect(facilityRootPath(SCOPED_FACILITY_ID)).toBe(`/facilities/${SCOPED_FACILITY_ID}`);
    expect(dashboardPath(SCOPED_FACILITY_ID)).toBe(`/facilities/${SCOPED_FACILITY_ID}/dashboard`);
    expect(floorSelectPath(SCOPED_FACILITY_ID)).toBe(`/facilities/${SCOPED_FACILITY_ID}/floors`);
    expect(floorPath(SCOPED_FACILITY_ID, "fl-2f")).toBe(`/facilities/${SCOPED_FACILITY_ID}/floor/fl-2f`);
    expect(alertsPath(SCOPED_FACILITY_ID)).toBe(`/facilities/${SCOPED_FACILITY_ID}/alerts`);
    expect(adminPath(SCOPED_FACILITY_ID)).toBe(`/facilities/${SCOPED_FACILITY_ID}/admin`);
    expect(adminPath(SCOPED_FACILITY_ID, "events/a1")).toBe(`/facilities/${SCOPED_FACILITY_ID}/admin/events/a1`);
  });

  it("권한 거부는 직원 홈으로 숨기지 않고 접근 거부 경로로 보낸다", () => {
    expect(forbiddenPathForUser(user("STAFF", "fac-a"))).toBe(ACCESS_DENIED_PATH);
  });
});
