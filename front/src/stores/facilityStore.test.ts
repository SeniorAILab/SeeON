import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

describe("facilityStore", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    calls.length = 0;
  });

  it("persists and restores the selected super admin facility in sessionStorage", async () => {
    const { useFacilityStore } = await import("./facilityStore");
    useFacilityStore.getState().setFacility("fac-a");
    expect(sessionStorage.getItem("eldercare.currentFacilityId")).toBe("fac-a");

    vi.resetModules();
    const restored = await import("./facilityStore");
    expect(restored.useFacilityStore.getState().currentFacilityId).toBe("fac-a");
  });

  it("clears persisted facility on logout/global return", async () => {
    const { useFacilityStore } = await import("./facilityStore");
    useFacilityStore.getState().setFacility("fac-a");
    useFacilityStore.getState().clearFacility();
    expect(useFacilityStore.getState().currentFacilityId).toBeNull();
    expect(sessionStorage.getItem("eldercare.currentFacilityId")).toBeNull();
  });

  it("resolveForUser(null) leaves a super admin on no facility instead of silently selecting one", async () => {
    const { useFacilityStore } = await import("./facilityStore");
    const resolved = useFacilityStore.getState().resolveForUser(null);
    expect(resolved).toBeNull();
    expect(useFacilityStore.getState().currentFacilityId).toBeNull();
  });

  it("prefers STAFF/ADMIN token facility over stale persisted facility", async () => {
    sessionStorage.setItem("eldercare.currentFacilityId", "fac-stale");
    const { useFacilityStore } = await import("./facilityStore");
    const resolved = useFacilityStore.getState().hydrateForUser({
      id: "admin",
      name: "Admin",
      email: "admin@example.test",
      role: "ADMIN",
      facilityId: "fac-token",
    });
    expect(resolved).toBe("fac-token");
    expect(useFacilityStore.getState().currentFacilityId).toBe("fac-token");
  });

  it("switchFacility stops live state, clears stale state, sets facility, then resubscribes", async () => {
    const { registerFacilityMonitorController, useFacilityStore } = await import("./facilityStore");
    useFacilityStore.getState().setFacility("fac-a");
    registerFacilityMonitorController({
      stop: vi.fn(() => calls.push("stop")),
      start: vi.fn((id: string) => calls.push(`start:${id}`)),
    });
    useFacilityStore.getState().switchFacility("fac-b");
    expect(calls).toEqual(["stop", "start:fac-b"]);
    expect(useFacilityStore.getState().currentFacilityId).toBe("fac-b");
  });
});
