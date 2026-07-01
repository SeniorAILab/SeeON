import { describe, expect, it } from "vitest";
import {
  ADMIN_HOME_PATH,
  STAFF_HOME_PATH,
  canAdmin,
  canAccessRole,
  canAcknowledge,
  defaultPathForRole,
  roleLabel,
} from "./roles";
import type { User } from "@/types";

const staffUser: User = {
  id: "u_staff",
  name: "요양보호사",
  email: "staff@example.com",
  role: "STAFF",
  facilityId: "fac_1",
};

const adminUser: User = {
  ...staffUser,
  id: "u_admin",
  role: "ADMIN",
};

describe("roles", () => {
  it("derives labels, default routes, and permissions from the shared role contract", () => {
    expect(roleLabel("SUPER_ADMIN")).toBe("시스템 관리자");
    expect(roleLabel("ADMIN")).toBe("원장님");
    expect(roleLabel("STAFF")).toBe("요양보호사");

    expect(defaultPathForRole("SUPER_ADMIN")).toBe(ADMIN_HOME_PATH);
    expect(defaultPathForRole("ADMIN")).toBe(ADMIN_HOME_PATH);
    expect(defaultPathForRole("STAFF")).toBe(STAFF_HOME_PATH);

    expect(canAccessRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(canAccessRole("ADMIN", "STAFF")).toBe(true);
    expect(canAccessRole("STAFF", "ADMIN")).toBe(false);

    expect(canAdmin(adminUser)).toBe(true);
    expect(canAdmin(staffUser)).toBe(false);
    expect(canAcknowledge(staffUser)).toBe(true);
  });
});
