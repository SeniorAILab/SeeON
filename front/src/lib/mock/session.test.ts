import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_SESSION,
  ROLE_LABELS,
  canSeeFullPhone,
  getDemoRole,
  setDemoRole,
} from "./session";

describe("demo session + role", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to the caregiver role", () => {
    expect(getDemoRole()).toBe("CAREGIVER");
  });

  it("persists a selected role across reads", () => {
    setDemoRole("OWNER");
    expect(getDemoRole()).toBe("OWNER");
    setDemoRole("ADMIN");
    expect(getDemoRole()).toBe("ADMIN");
  });

  it("exposes Korean role labels", () => {
    expect(ROLE_LABELS.CAREGIVER).toBe("요양보호사");
    expect(ROLE_LABELS.OWNER).toBe("원장");
    expect(ROLE_LABELS.ADMIN).toBe("관리자");
  });

  it("only owner/admin may see full guardian phone numbers", () => {
    expect(canSeeFullPhone("CAREGIVER")).toBe(false);
    expect(canSeeFullPhone("OWNER")).toBe(true);
    expect(canSeeFullPhone("ADMIN")).toBe(true);
  });

  it("ships a fixed demo session shape", () => {
    expect(DEMO_SESSION.user.orgId).toBe("org-happy-nogyang-01");
    expect(DEMO_SESSION.user.role).toBe("CAREGIVER");
  });
});
