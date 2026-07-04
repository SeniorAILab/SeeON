import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFacility, listFacilities } from "./facilities";
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

  it("does not invent a facility scope header when no facility is selected", async () => {
    getCurrentFacilityIdMock.mockReturnValue(null);
    requestJsonMock.mockResolvedValue(facility);

    await getFacility("fac/1");

    expect(requestJsonMock).toHaveBeenCalledWith("/facilities/fac%2F1", { headers: {} });
  });

  it("lists facilities from the global facilities endpoint", async () => {
    requestJsonMock.mockResolvedValue([facility]);

    await expect(listFacilities()).resolves.toEqual([facility]);

    expect(requestJsonMock).toHaveBeenCalledWith("/facilities");
  });
});
