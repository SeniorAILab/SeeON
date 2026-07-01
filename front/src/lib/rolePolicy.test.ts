import { describe, expect, it } from "vitest";
import {
  ADMIN_HOME_PATH,
  STAFF_HOME_PATH,
  canAccessRole,
  defaultPathForRole,
  hasRoleCapability,
  roleLabel,
} from "./rolePolicy";

describe("rolePolicy", () => {
  it("derives labels, default routes, and capabilities from the shared role contract", () => {
    expect(roleLabel("SUPER_ADMIN")).toBe("시스템 관리자");
    expect(roleLabel("ADMIN")).toBe("원장님");
    expect(roleLabel("STAFF")).toBe("요양보호사");

    expect(defaultPathForRole("SUPER_ADMIN")).toBe(ADMIN_HOME_PATH);
    expect(defaultPathForRole("ADMIN")).toBe(ADMIN_HOME_PATH);
    expect(defaultPathForRole("STAFF")).toBe(STAFF_HOME_PATH);

    expect(canAccessRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(canAccessRole("ADMIN", "STAFF")).toBe(true);
    expect(canAccessRole("STAFF", "ADMIN")).toBe(false);

    expect(hasRoleCapability("ADMIN", "facilityAdmin")).toBe(true);
    expect(hasRoleCapability("STAFF", "facilityAdmin")).toBe(false);
    expect(hasRoleCapability("STAFF", "alertAcknowledge")).toBe(true);
  });
});
