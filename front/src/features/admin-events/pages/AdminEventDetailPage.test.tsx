import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { alertService } from "@/services/alertService";
import { dashboardService } from "@/services/dashboardService";
import { eventService } from "@/services/eventService";
import { useAuthStore } from "@/stores/authStore";
import type { DashboardResponse, DetectionEvent, User } from "@/types";
import { AdminEventDetailPage } from "./AdminEventDetailPage";

vi.mock("@/services/alertService", () => ({
  alertService: {
    getMedia: vi.fn(),
    recordMediaAccess: vi.fn(),
  },
}));

vi.mock("@/services/dashboardService", () => ({
  dashboardService: { getDashboard: vi.fn() },
}));

vi.mock("@/services/eventService", () => ({
  eventService: {
    addAction: vi.fn(),
    getById: vi.fn(),
  },
}));

const USER: User = {
  id: "user-1",
  name: "관리자",
  email: "admin@example.test",
  role: "ADMIN",
  facilityId: "facility-1",
};

const EVENT: DetectionEvent = {
  id: "alert-1",
  facilityId: "facility-1",
  spaceId: "space-1",
  room: "101호",
  eventType: "FALL_RISK",
  riskLevel: "HIGH",
  message: "낙상 감지",
  aiSummary: "위험 이벤트가 감지되었습니다.",
  detectedAt: "2026-07-16T00:00:10.000Z",
  alertStatus: "PENDING",
  actions: [],
};

const DASHBOARD: DashboardResponse = {
  facility: {
    id: "facility-1",
    name: "행복한 요양원",
    address: "",
    phone: "",
  },
  floors: [{ id: "floor-1", facilityId: "facility-1", name: "1층", orderIndex: 1 }],
  spaces: [{
    id: "space-1",
    facilityId: "facility-1",
    floorId: "floor-1",
    name: "101호",
    type: "ROOM",
    capacity: 1,
    isActive: true,
  }],
  statuses: {},
  summary: {
    totalSpaces: 1,
    stable: 0,
    caution: 0,
    danger: 1,
    checkNeeded: 0,
    unacknowledged: 1,
  },
  unacknowledgedEvents: [],
};

function renderDetail(): void {
  render(
    <MemoryRouter initialEntries={["/events/alert-1"]}>
      <Routes>
        <Route path="/events/:eventId" element={<AdminEventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(eventService.getById).mockResolvedValue(EVENT);
  vi.mocked(dashboardService.getDashboard).mockResolvedValue(DASHBOARD);
  vi.mocked(alertService.getMedia).mockResolvedValue({
    status: "UNAVAILABLE",
    alertId: EVENT.id,
  });
  vi.mocked(alertService.recordMediaAccess).mockResolvedValue();
  useAuthStore.setState({ user: USER, initialized: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  useAuthStore.setState({ user: null, initialized: false });
});

describe("AdminEventDetailPage alert evidence integration", () => {
  it("keeps the evidence card and metadata request off by default", async () => {
    vi.stubEnv("VITE_EVENT_CLIPS_ENABLED", undefined);
    renderDetail();

    expect(await screen.findByRole("heading", { name: "101호 이슈 상세" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "감지 근거 영상" })).toBeNull();
    expect(alertService.getMedia).not.toHaveBeenCalled();
  });

  it("loads alert-bound evidence only when the deployment opts in", async () => {
    vi.stubEnv("VITE_EVENT_CLIPS_ENABLED", "true");
    renderDetail();

    expect(await screen.findByRole("heading", { name: "감지 근거 영상" })).toBeTruthy();
    expect(await screen.findByText("이 알림에 연결된 근거 영상이 없습니다.")).toBeTruthy();
    const description = screen.getByText(
      /관리자 권한으로 이 알림에 연결된 안전 확인용 클립만 확인할 수 있습니다/,
    );

    expect(description.classList.contains("text-ink-soft")).toBe(true);
    expect(description.classList.contains("text-ink-faint")).toBe(false);
    expect(alertService.getMedia).toHaveBeenCalledWith(EVENT.id, expect.any(AbortSignal));
  });
});
