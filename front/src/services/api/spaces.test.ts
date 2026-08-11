import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSpace, deleteSpace, listSpaces, mapSpaceDto, updateSpace } from "./spaces";
import { requestJson } from "@/services/apiClient";

vi.mock("@/services/apiClient", () => ({
  requestJson: vi.fn(),
}));

const requestJsonMock = vi.mocked(requestJson);

const backendSpace = {
  id: "sp_201",
  facilityId: "fac_1",
  floorId: "fl_2",
  name: "201호",
  type: "ROOM" as const,
  capacity: 4,
  isActive: true,
  assignedStaff: null,
  provisioningSource: "PRODUCT" as const,
  createdAt: "2026-07-03T00:00:00.000Z",
};

describe("spaces api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps backend space DTOs to frontend spaces", () => {
    expect(mapSpaceDto({ ...backendSpace, assignedStaff: "김요양" })).toEqual({
      id: "sp_201",
      facilityId: "fac_1",
      floorId: "fl_2",
      name: "201호",
      type: "ROOM",
      capacity: 4,
      isActive: true,
      assignedStaff: "김요양",
      provisioningSource: "PRODUCT",
    });
  });

  it("lists spaces from the real backend path", async () => {
    requestJsonMock.mockResolvedValue([backendSpace]);

    await expect(listSpaces()).resolves.toEqual([
      {
        id: "sp_201",
        facilityId: "fac_1",
        floorId: "fl_2",
        name: "201호",
        type: "ROOM",
        capacity: 4,
        isActive: true,
        assignedStaff: undefined,
        provisioningSource: "PRODUCT",
      },
    ]);
    expect(requestJsonMock).toHaveBeenCalledWith("/spaces");
  });

  it("maps an EDGE-owned space and rejects an invalid provisioningSource", () => {
    expect(mapSpaceDto({ ...backendSpace, provisioningSource: "EDGE" })).toMatchObject({
      provisioningSource: "EDGE",
    });
    expect(() =>
      mapSpaceDto({ ...backendSpace, provisioningSource: "BOGUS" as never }),
    ).toThrow();
  });

  it("creates spaces with transitional backend-required type and capacity defaults", async () => {
    requestJsonMock.mockResolvedValue(backendSpace);
    const input = { floorId: "fl_2", name: "202호", isActive: true };

    await createSpace(input);

    expect(requestJsonMock).toHaveBeenCalledWith("/spaces", {
      method: "POST",
      body: JSON.stringify({
        type: "ROOM",
        capacity: 1,
        ...input,
      }),
    });
  });

  it("updates spaces with PATCH by id", async () => {
    requestJsonMock.mockResolvedValue({ ...backendSpace, isActive: false });

    await updateSpace("sp/201", { name: "201호", isActive: false });

    expect(requestJsonMock).toHaveBeenCalledWith("/spaces/sp%2F201", {
      method: "PATCH",
      body: JSON.stringify({ name: "201호", isActive: false }),
    });
  });

  it("deletes spaces with DELETE and parses the returned space DTO", async () => {
    requestJsonMock.mockResolvedValue(backendSpace);

    await expect(deleteSpace("sp/201")).resolves.toMatchObject({ id: "sp_201", name: "201호" });

    expect(requestJsonMock).toHaveBeenCalledWith("/spaces/sp%2F201", { method: "DELETE" });
  });
});
