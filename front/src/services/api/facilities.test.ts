import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFacility, getFacilityEdgeStatus, listFacilities } from "./facilities";
import { requestJson } from "@/services/apiClient";
import { getCurrentFacilityId } from "@/stores/facilityStore";

vi.mock("@/services/apiClient", () => ({
  requestJson: vi.fn(),
}));

vi.mock("@/stores/facilityStore", () => ({
  getCurrentFacilityId: vi.fn(),
}));

const requestJsonMock = vi.mocked(requestJson);
const getCurrentFacilityIdMock = vi.mocked(getCurrentFacilityId);

const facility = {
  id: "fac/1",
  name: "행복 요양원",
  address: "서울시 중구",
  phone: "02-123-4567",
};

describe("facilities api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentFacilityIdMock.mockReturnValue("fac/1");
  });

  it("gets a facility by id with an explicit facility scope header", async () => {
    requestJsonMock.mockResolvedValue(facility);

    await expect(getFacility("fac/1")).resolves.toEqual(facility);

    expect(requestJsonMock).toHaveBeenCalledWith("/facilities/fac%2F1", {
      headers: { "X-Facility-Id": "fac/1" },
    });
  });
  it("normalizes nullable contact fields from a single-facility response", async () => {
    requestJsonMock.mockResolvedValue({ ...facility, address: null, phone: null });

    await expect(getFacility("fac/1")).resolves.toEqual({
      ...facility,
      address: "",
      phone: "",
    });
  });


  it("does not invent a facility scope header when no facility is selected", async () => {
    getCurrentFacilityIdMock.mockReturnValue(null);
    requestJsonMock.mockResolvedValue(facility);

    await getFacility("fac/1");

    expect(requestJsonMock).toHaveBeenCalledWith("/facilities/fac%2F1", { headers: {} });
  });

  it("normalizes nullable contact fields from the facilities list response", async () => {
    requestJsonMock.mockResolvedValue([{ ...facility, address: null, phone: null }]);

    await expect(listFacilities()).resolves.toEqual([
      {
        ...facility,
        address: "",
        phone: "",
      },
    ]);

    expect(requestJsonMock).toHaveBeenCalledWith("/facilities");
  });

  it("gets the facility edge status with an explicit facility scope header", async () => {
    const edgeStatus = {
      connectionState: "CONNECTED" as const,
      lastHeartbeatAt: "2026-08-12T00:00:00.000Z",
      lastSyncedAt: "2026-08-11T23:55:00.000Z",
      healthyCameraCount: 3,
      totalCameraCount: 4,
    };
    requestJsonMock.mockResolvedValue(edgeStatus);

    await expect(getFacilityEdgeStatus("fac/1")).resolves.toEqual(edgeStatus);

    expect(requestJsonMock).toHaveBeenCalledWith("/facilities/fac%2F1/edge-status", {
      headers: { "X-Facility-Id": "fac/1" },
    });
  });

  it("maps a not-enrolled edge status with null timestamps", async () => {
    requestJsonMock.mockResolvedValue({
      connectionState: "NOT_ENROLLED",
      lastHeartbeatAt: null,
      lastSyncedAt: null,
      healthyCameraCount: 0,
      totalCameraCount: 0,
    });

    await expect(getFacilityEdgeStatus("fac/1")).resolves.toEqual({
      connectionState: "NOT_ENROLLED",
      lastHeartbeatAt: null,
      lastSyncedAt: null,
      healthyCameraCount: 0,
      totalCameraCount: 0,
    });
  });

  it("rejects an invalid connectionState", async () => {
    requestJsonMock.mockResolvedValue({
      connectionState: "BOGUS",
      lastHeartbeatAt: null,
      lastSyncedAt: null,
      healthyCameraCount: 0,
      totalCameraCount: 0,
    });

    await expect(getFacilityEdgeStatus("fac/1")).rejects.toThrow();
  });
});
