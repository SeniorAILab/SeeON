import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("조치/메모 저장 실패를 침묵으로 넘기지 않는다", () => {
  it("조치 저장이 거부되면 사유를 화면에 띄운다", async () => {
    const { ApiError } = await import("@/services/apiClient");
    vi.mocked(eventService.addAction).mockRejectedValueOnce(
      new ApiError(
        400,
        JSON.stringify({
          statusCode: 400,
          message: "조치 결과를 먼저 기록해야 해결 완료로 바꿀 수 있습니다.",
        }),
      ),
    );

    renderDetail();

    const input = await screen.findByPlaceholderText("메모를 입력하세요.");
    fireEvent.change(input, { target: { value: "방문해 확인함" } });
    fireEvent.click(screen.getByRole("button", { name: "확인 완료 처리" }));

    const node = await screen.findByRole("alert");
    expect(node.textContent).toContain("조치 결과를 먼저 기록");
  });

  it("네트워크 오류도 문구로 알린다", async () => {
    vi.mocked(eventService.addAction).mockRejectedValueOnce(new Error("network down"));

    renderDetail();

    const input = await screen.findByPlaceholderText("메모를 입력하세요.");
    fireEvent.change(input, { target: { value: "방문해 확인함" } });
    fireEvent.click(screen.getByRole("button", { name: "확인 완료 처리" }));

    const node = await screen.findByRole("alert");
    expect(node.textContent).toContain("조치를 저장하지 못했습니다");
  });

  it("성공하면 오류 문구가 남지 않는다", async () => {
    vi.mocked(eventService.addAction).mockResolvedValueOnce(EVENT);

    renderDetail();

    const input = await screen.findByPlaceholderText("메모를 입력하세요.");
    fireEvent.change(input, { target: { value: "방문해 확인함" } });
    fireEvent.click(screen.getByRole("button", { name: "확인 완료 처리" }));

    await waitFor(() => expect(eventService.addAction).toHaveBeenCalled());
    expect(screen.queryByText(/저장하지 못했습니다/)).toBeNull();
  });

  it("실패해도 입력한 메모를 지우지 않는다", async () => {
    // 실패했는데 작성 내용까지 사라지면 처음부터 다시 써야 한다.
    vi.mocked(eventService.addAction).mockRejectedValueOnce(new Error("network down"));

    renderDetail();

    const input = (await screen.findByPlaceholderText(
      "메모를 입력하세요.",
    )) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "방문해 확인함" } });
    fireEvent.click(screen.getByRole("button", { name: "확인 완료 처리" }));

    await screen.findByRole("alert");
    expect(input.value).toBe("방문해 확인함");
  });
});
