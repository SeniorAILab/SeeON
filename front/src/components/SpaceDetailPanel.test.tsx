import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpaceDetailPanel } from "./SpaceDetailPanel";
import { dashboardService } from "@/services/dashboardService";
import { eventService } from "@/services/eventService";
import { useAuthStore } from "@/store/authStore";
import { listCameras } from "@/services/api/cameras";
import type { DetectionEvent, Space, SpaceStatus } from "@/types";

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getSpaceEvents: vi.fn(),
  },
}));

vi.mock("@/services/eventService", () => ({
  eventService: {
    addAction: vi.fn(),
  },
}));

vi.mock("@/services/api/cameras", () => ({
  listCameras: vi.fn(),
}));

const space: Space = {
  id: "space-201",
  facilityId: "facility-1",
  floorId: "floor-2",
  name: "201호",
  type: "ROOM",
  capacity: 2,
  isActive: true,
};

const status: SpaceStatus = {
  id: "status-201",
  spaceId: space.id,
  peopleCount: 1,
  movementLevel: "MEDIUM",
  fallRiskLevel: "HIGH",
  status: "DANGER",
  aiSummary: "침상 이탈 위험이 감지되었습니다.",
  lastDetectedAt: "2026-07-03T00:00:00.000Z",
  kakaoAlertStatus: "PENDING",
};

const activeEvent: DetectionEvent = {
  id: "event-1",
  facilityId: "facility-1",
  spaceId: space.id,
  eventType: "BED_EXIT",
  riskLevel: "HIGH",
  message: "침상 이탈 감지",
  aiSummary: "침상 이탈 위험이 감지되었습니다.",
  detectedAt: "2026-07-03T00:00:00.000Z",
  kakaoAlertStatus: "PENDING",
  actions: [],
  confidence: 0.91,
};

describe("SpaceDetailPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: {
        id: "staff-1",
        name: "Care Staff",
        email: "staff@example.com",
        role: "STAFF",
        facilityId: "facility-1",
      },
    });
    vi.mocked(listCameras).mockResolvedValue([]);
  });

  it("shows the refreshed empty event state after an action without falling back to stale events", async () => {
    vi.mocked(dashboardService.getSpaceEvents)
      .mockResolvedValueOnce([activeEvent])
      .mockResolvedValueOnce([]);
    vi.mocked(eventService.addAction).mockResolvedValue({ ...activeEvent, kakaoAlertStatus: "ACKNOWLEDGED" });
    const onChanged = vi.fn();

    render(
      <MemoryRouter>
        <SpaceDetailPanel space={space} status={status} onClose={vi.fn()} onChanged={onChanged} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("침상 이탈 감지")).toBeTruthy();
    expect(screen.getByText("확인 완료 처리")).toBeTruthy();

    fireEvent.click(screen.getByText("확인 완료 처리"));

    await waitFor(() => {
      expect(eventService.addAction).toHaveBeenCalledWith(
        activeEvent.id,
        "ACKNOWLEDGED",
        undefined,
        "Care Staff",
      );
    });

    expect(await screen.findByText("기록된 이벤트가 없습니다.")).toBeTruthy();
    expect(screen.getByText("현재 확인이 필요한 이벤트가 없습니다.")).toBeTruthy();
    expect(screen.queryByText("침상 이탈 감지")).toBeNull();
    expect(screen.queryByText("확인 완료 처리")).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("renders camera online, offline, unregistered, and error states distinctly", async () => {
    vi.mocked(dashboardService.getSpaceEvents).mockResolvedValue([]);

    vi.mocked(listCameras).mockResolvedValueOnce([
      { id: "camera-1", facilityId: "facility-1", spaceId: space.id, online: true, lastSeenAt: null },
    ]);
    const { unmount } = render(
      <MemoryRouter>
        <SpaceDetailPanel space={space} status={status} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("온라인")).toBeTruthy();
    unmount();

    vi.mocked(listCameras).mockResolvedValueOnce([
      { id: "camera-1", facilityId: "facility-1", spaceId: space.id, online: false, lastSeenAt: null },
    ]);
    const offline = render(
      <MemoryRouter>
        <SpaceDetailPanel space={space} status={status} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("오프라인")).toBeTruthy();
    offline.unmount();

    vi.mocked(listCameras).mockResolvedValueOnce([]);
    const unregistered = render(
      <MemoryRouter>
        <SpaceDetailPanel space={space} status={status} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("미등록")).toBeTruthy();
    unregistered.unmount();

    vi.mocked(listCameras).mockRejectedValueOnce(new Error("network"));
    render(
      <MemoryRouter>
        <SpaceDetailPanel space={space} status={status} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("연결 상태 확인 불가")).toBeTruthy();
  });
});
