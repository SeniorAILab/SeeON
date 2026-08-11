import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMonitorSettingsPage } from "./AdminMonitorSettingsPage";
import { floorPath } from "@/lib/routeAccess";
import { useMonitorSettingsStore } from "@/features/monitor/stores/monitorSettingsStore";
import { listFloors } from "@/services/api/floors";
import { listSpaces } from "@/services/api/spaces";

const mockNavigate = vi.fn();
const facilityId = "fac_happy_nokyang";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock("@/hooks/useActiveFacilityId", () => ({ useActiveFacilityId: () => facilityId }));
vi.mock("@/services/api/floors", () => ({ listFloors: vi.fn() }));
vi.mock("@/services/api/spaces", () => ({ listSpaces: vi.fn() }));

const floors = [
  { id: "fl_1f", facilityId, name: "1F", orderIndex: 1, provisioningSource: "PRODUCT" as const },
  { id: "fl_2f", facilityId, name: "2F", orderIndex: 2, provisioningSource: "PRODUCT" as const },
];

beforeEach(() => {
  vi.clearAllMocks();
  useMonitorSettingsStore.setState({
    defaultFloorId: "fl_2f",
    refreshMs: 6000,
    alertSound: false,
    nightMode: false,
    cardSize: "lg",
    visibleSpaceIds: null,
    allowAllView: true,
  });
  vi.mocked(listFloors).mockResolvedValue(floors);
  vi.mocked(listSpaces).mockResolvedValue([
    { id: "space_1", facilityId, floorId: "fl_1f", name: "중앙복도", type: "HALLWAY", capacity: 1, isActive: true, provisioningSource: "PRODUCT" as const },
    { id: "space_2", facilityId, floorId: "fl_2f", name: "중앙복도", type: "HALLWAY", capacity: 1, isActive: true, provisioningSource: "PRODUCT" as const },
  ]);
});

describe("AdminMonitorSettingsPage", () => {
  it("opens the configured default floor", async () => {
    render(<AdminMonitorSettingsPage />);
    await screen.findByRole("option", { name: "2F" });

    fireEvent.click(screen.getByRole("button", { name: "모니터 열기" }));

    expect(mockNavigate).toHaveBeenCalledWith(floorPath(facilityId, "fl_2f"));
  });

  it("names space checkboxes with their floor", async () => {
    render(<AdminMonitorSettingsPage />);

    expect(await screen.findByRole("checkbox", { name: "2F 중앙복도" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "1F 중앙복도" })).toBeTruthy();
  });
  it("replaces a stale cross-facility default with the first loaded floor", async () => {
    const activeFloorId = "fl_west_1";
    useMonitorSettingsStore.setState({ defaultFloorId: "fl_2f" });
    vi.mocked(listFloors).mockResolvedValue([
      { id: activeFloorId, facilityId, name: "서관 1층", orderIndex: 1, provisioningSource: "PRODUCT" as const },
      { id: "fl_west_2", facilityId, name: "서관 2층", orderIndex: 2, provisioningSource: "PRODUCT" as const },
    ]);

    render(<AdminMonitorSettingsPage />);
    await screen.findByRole("option", { name: "서관 1층" });

    fireEvent.click(screen.getByRole("button", { name: "모니터 열기" }));

    expect(mockNavigate).toHaveBeenCalledWith(floorPath(facilityId, activeFloorId));
    expect(useMonitorSettingsStore.getState().defaultFloorId).toBe(activeFloorId);
  });
});
