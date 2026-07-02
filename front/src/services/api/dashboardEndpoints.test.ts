import { beforeEach, describe, expect, it, vi } from "vitest";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const facility = {
  id: "fac_happy_nokyang",
  name: "Happy Nokyang",
  code: "happy-nokyang",
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
    vi.stubEnv("VITE_USE_MOCK", "false");
  });

  it("hydrates room statuses from spaces and overlays room-level alerts without mis-keying resident status", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/facilities/current")) return okJsonResponse(facility);
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
      kakaoAlertStatus: "SENT",
      bedsideActivity: true,
      emergency: true,
    });
    expect(dashboard.unacknowledgedEvents).toHaveLength(1);
    expect(dashboard.summary.danger).toBe(1);
  });

  it("lists facilities through the backend facility selector endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/facilities")) {
        return okJsonResponse([{ ...facility, selectionToken: "opaque-token" }]);
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { listFacilities } = await import("./dashboardEndpoints");
    await expect(listFacilities()).resolves.toEqual([
      { ...facility, selectionToken: "opaque-token" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/facilities",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("selects a facility with an opaque backend-issued token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/facilities/selection")) {
        expect(init?.body).toBe(JSON.stringify({ selectionToken: "opaque-token" }));
        return okJsonResponse({ facility });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { selectFacility } = await import("./dashboardEndpoints");
    await expect(selectFacility("opaque-token")).resolves.toEqual(facility);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/facilities/selection",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
  });

  it("updates only the current facility profile fields", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/facilities/current")) {
        expect(init?.body).toBe(
          JSON.stringify({
            name: "행복한요양원 녹양역점",
            address: "경기도 의정부시",
            phone: "031-856-8090",
          })
        );
        return okJsonResponse({
          ...facility,
          name: "행복한요양원 녹양역점",
          address: "경기도 의정부시",
          phone: "031-856-8090",
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { updateCurrentFacility } = await import("./dashboardEndpoints");
    await expect(
      updateCurrentFacility({
        name: "행복한요양원 녹양역점",
        address: "경기도 의정부시",
        phone: "031-856-8090",
      })
    ).resolves.toMatchObject({
      name: "행복한요양원 녹양역점",
      address: "경기도 의정부시",
      phone: "031-856-8090",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/facilities/current",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
      })
    );
  });
});
