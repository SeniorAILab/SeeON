import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFacilityPage } from "./AdminFacilityPage";
import { getFacility, getFacilityEdgeStatus, updateFacility } from "@/services/api/facilities";

vi.mock("@/hooks/useActiveFacilityId", () => ({
  useActiveFacilityId: () => "facility-1",
}));

vi.mock("@/services/api/facilities", () => ({
  getFacility: vi.fn(async () => ({
    id: "facility-1",
    name: "행복 요양원",
    address: "서울시 중구",
    phone: "02-123-4567",
  })),
  updateFacility: vi.fn(),
  getFacilityEdgeStatus: vi.fn(async () => ({
    connectionState: "CONNECTED" as const,
    lastHeartbeatAt: "2026-08-12T00:00:00.000Z",
    lastSyncedAt: "2026-08-11T23:55:00.000Z",
    healthyCameraCount: 3,
    totalCameraCount: 4,
  })),
}));

const getFacilityMock = vi.mocked(getFacility);
const updateFacilityMock = vi.mocked(updateFacility);
const getFacilityEdgeStatusMock = vi.mocked(getFacilityEdgeStatus);

describe("AdminFacilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFacilityEdgeStatusMock.mockResolvedValue({
      connectionState: "CONNECTED",
      lastHeartbeatAt: "2026-08-12T00:00:00.000Z",
      lastSyncedAt: "2026-08-11T23:55:00.000Z",
      healthyCameraCount: 3,
      totalCameraCount: 4,
    });
  });

  it("renders editable facility fields without facility code", async () => {
    render(<AdminFacilityPage />);

    expect(await screen.findByRole("heading", { name: "시설 정보" })).toBeTruthy();
    expect(screen.getByDisplayValue("행복 요양원")).toBeTruthy();
    expect(screen.getByDisplayValue("서울시 중구")).toBeTruthy();
    expect(screen.getByDisplayValue("02-123-4567")).toBeTruthy();
    expect(screen.queryByText(/코드/)).toBeNull();
    expect(screen.getByRole("button", { name: /저장/ })).toBeTruthy();
    expect(updateFacilityMock).not.toHaveBeenCalled();
  });

  it("submits facility PATCH changes", async () => {
    updateFacilityMock.mockResolvedValueOnce({
      id: "facility-1",
      name: "행복 요양원 본관",
      address: "서울시 종로구",
      phone: "02-999-0000",
    });

    render(<AdminFacilityPage />);

    fireEvent.change(await screen.findByDisplayValue("행복 요양원"), { target: { value: "행복 요양원 본관" } });
    fireEvent.change(screen.getByDisplayValue("서울시 중구"), { target: { value: "서울시 종로구" } });
    fireEvent.change(screen.getByDisplayValue("02-123-4567"), { target: { value: "02-999-0000" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(updateFacilityMock).toHaveBeenCalledWith("facility-1", {
        name: "행복 요양원 본관",
        address: "서울시 종로구",
        phone: "02-999-0000",
      });
    });
  });

  it("shows the backend error when facility loading fails", async () => {
    getFacilityMock.mockRejectedValueOnce(new Error("Forbidden"));

    render(<AdminFacilityPage />);

    expect(await screen.findByText(/시설 정보를 불러오지 못했습니다/)).toBeTruthy();
    expect(screen.getByText(/Forbidden/)).toBeTruthy();
  });

  it("shows the Edge connection status, heartbeat, sync time, and healthy camera count", async () => {
    render(<AdminFacilityPage />);

    expect(await screen.findByText("Edge 연결 상태")).toBeTruthy();
    expect(await screen.findByText("연결됨")).toBeTruthy();
    expect(screen.getByText("3 / 4")).toBeTruthy();
    expect(getFacilityEdgeStatusMock).toHaveBeenCalledWith("facility-1");
  });

  it("shows a not-enrolled Edge status without heartbeat or sync timestamps", async () => {
    getFacilityEdgeStatusMock.mockResolvedValueOnce({
      connectionState: "NOT_ENROLLED",
      lastHeartbeatAt: null,
      lastSyncedAt: null,
      healthyCameraCount: 0,
      totalCameraCount: 0,
    });

    render(<AdminFacilityPage />);

    expect(await screen.findByText("미등록")).toBeTruthy();
    expect(screen.getAllByText("없음").length).toBe(2);
    expect(screen.getByText("0 / 0")).toBeTruthy();
  });

  it("shows a fallback error when the Edge status fetch fails without blocking the facility form", async () => {
    getFacilityEdgeStatusMock.mockRejectedValueOnce(new Error("Edge status unavailable"));

    render(<AdminFacilityPage />);

    expect(await screen.findByText("Edge status unavailable")).toBeTruthy();
    expect(screen.getByDisplayValue("행복 요양원")).toBeTruthy();
  });
});
