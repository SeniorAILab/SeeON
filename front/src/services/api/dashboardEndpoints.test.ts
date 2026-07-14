import { beforeEach, describe, expect, it, vi } from "vitest";
const SCOPED_FACILITY_ID = "fac_happy_nokyang";


function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const facility = {
  id: SCOPED_FACILITY_ID,
  name: "Happy Nokyang",
  address: "Seoul",
  phone: "02-0000-0000",
};

const floors = [{ id: "floor_2", facilityId: facility.id, name: "2F", orderIndex: 2 }];

const spaces = [
  {
    id: "sp_201",
    facilityId: facility.id,
    floorId: "floor_2",
    name: "201호",
    type: "ROOM",
    capacity: 1,
    isActive: true,
  },
];

const residentStatuses = [
  {
    id: "resident-status-1",
    residentId: "res_201_a",
    state: "STABLE",
    lastSeenAt: "2026-06-22T00:00:00.000Z",
  },
];

const bedExitAlert = {
  alertSeq: "10",
  id: "alert_201",
  facilityId: facility.id,
  residentId: null,
  cameraId: "cam_sp_201",
  spaceId: "sp_201",
  room: "201호",
  type: "bed-exit",
  probability: 0.92,
  detectedAt: "2026-06-22T01:00:00.000Z",
  status: "SENT",
};

describe("dashboardEndpoints", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("hydrates room statuses from spaces and overlays room-level alerts without mis-keying resident status", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return okJsonResponse({
          id: "user-1",
          email: "admin@sen.ai",
          nickname: "원장",
          role: "ADMIN",
          facilityId: facility.id,
        });
      }
      if (url.endsWith(`/facilities/${facility.id}`)) return okJsonResponse(facility);
      if (url.endsWith("/floors")) return okJsonResponse(floors);
      if (url.endsWith("/spaces")) return okJsonResponse(spaces);
      if (url.endsWith("/alerts")) return okJsonResponse([bedExitAlert]);
      if (url.endsWith("/status")) return okJsonResponse(residentStatuses);
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getDashboardFromBackend } = await import("./dashboardEndpoints");
    const dashboard = await getDashboardFromBackend();

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/status"),
      expect.anything()
    );
    expect(dashboard.statuses).not.toHaveProperty("undefined");
    expect(dashboard.statuses.sp_201).toMatchObject({
      spaceId: "sp_201",
      status: "DANGER",
      alertStatus: "SENT",
      bedsideActivity: true,
      emergency: true,
    });
    expect(dashboard.unacknowledgedEvents).toHaveLength(1);
    expect(dashboard.summary.danger).toBe(1);
  });

  it("gets the current facility through /auth/me then /facilities/:id", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return okJsonResponse({
          id: "user-1",
          email: "admin@sen.ai",
          nickname: "원장",
          role: "ADMIN",
          facilityId: facility.id,
        });
      }
      if (url.endsWith(`/facilities/${facility.id}`)) return okJsonResponse(facility);
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getCurrentFacility } = await import("./dashboardEndpoints");
    await expect(getCurrentFacility()).resolves.toEqual(facility);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/facilities/${facility.id}`,
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("exposes role dashboard read-model paths using facility scope", async () => {
    const { dashboardReadModelPath } = await import("./dashboardEndpoints");

    expect(dashboardReadModelPath.superAdmin()).toBe("/dashboards/super-admin");
    expect(dashboardReadModelPath.facilityAdmin("fac-a")).toBe(
      "/dashboards/facilities/fac-a/admin"
    );
    expect(dashboardReadModelPath.facilityStaff("fac-a")).toBe(
      "/dashboards/facilities/fac-a/staff"
    );
    expect(dashboardReadModelPath.facilityMonitor("fac-a", "fl-2f")).toBe(
      "/dashboards/facilities/fac-a/monitor?floorId=fl-2f"
    );
  });

  it("lists facilities through the backend facility selector endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/facilities")) return okJsonResponse([facility]);
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { listFacilities } = await import("./dashboardEndpoints");
    await expect(listFacilities()).resolves.toEqual([facility]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/facilities",
      expect.objectContaining({ credentials: "include" })
    );
  });
});
