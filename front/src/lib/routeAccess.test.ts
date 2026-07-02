import { describe, expect, it } from "vitest";
import {
  ACCESS_DENIED_PATH,
  DASHBOARD_HOME_PATH,
  dashboardAdminPath,
  dashboardStaffPath,
  defaultPathForUser,
  forbiddenPathForUser,
  monitorFloorPath,
  monitorHomePath,
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
  it("역할별 기본 경로를 approved UI journey에 맞춘다", () => {
    expect(defaultPathForUser(user("SUPER_ADMIN", null))).toBe(DASHBOARD_HOME_PATH);
    expect(defaultPathForUser(user("ADMIN", "fac-a"))).toBe("/dashboard/admin");
    expect(defaultPathForUser(user("STAFF", "fac-a"))).toBe("/dashboard/staff");
  });

  it("시설 workspace와 monitor display 경로에 internal facility id를 노출하지 않는다", () => {
    expect(dashboardAdminPath()).toBe("/dashboard/admin");
    expect(dashboardStaffPath()).toBe("/dashboard/staff");
    expect(monitorHomePath()).toBe("/monitor");
    expect(monitorFloorPath("fl-2f")).toBe("/monitor/floors/fl-2f");
  });

  it("권한 거부는 직원 홈으로 숨기지 않고 접근 거부 경로로 보낸다", () => {
    expect(forbiddenPathForUser(user("STAFF", "fac-a"))).toBe(ACCESS_DENIED_PATH);
  });
});
