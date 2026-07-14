import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventsPage } from "./EventsPage";
import { dashboardService } from "@/services/dashboardService";
import { eventService } from "@/services/eventService";
import type { DetectionEvent } from "@/types";

vi.mock("@/services/eventService", () => ({
  eventService: {
    listByFacility: vi.fn(),
    acknowledge: vi.fn(),
  },
}));

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getDashboard: vi.fn(),
  },
}));

vi.mock("@/hooks/useActiveFacilityId", () => ({
  useActiveFacilityId: () => "facility-events-test",
}));

const openEvent: DetectionEvent = {
  id: "event-open",
  facilityId: "facility-events-test",
  spaceId: "space-open",
  eventType: "FALL_RISK",
  riskLevel: "HIGH",
  message: "낙상 감지",
  aiSummary: "미확인 이벤트 요약",
  detectedAt: "2026-07-14T00:00:00.000Z",
  alertStatus: "PENDING",
  actions: [],
};

const acknowledgedEvent: DetectionEvent = {
  ...openEvent,
  id: "event-acknowledged",
  spaceId: "space-acknowledged",
  aiSummary: "확인 완료 이벤트 요약",
  alertStatus: "ACKNOWLEDGED",
};

beforeEach(() => {
  vi.mocked(eventService.listByFacility).mockResolvedValue([openEvent, acknowledgedEvent]);
  vi.mocked(dashboardService.getDashboard).mockResolvedValue({
    spaces: [
      { id: "space-open", name: "101호" },
      { id: "space-acknowledged", name: "102호" },
    ],
  } as Awaited<ReturnType<typeof dashboardService.getDashboard>>);
});

describe("EventsPage", () => {
  it("initializes the unacknowledged filter from the OPEN query parameter", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/events?filter=OPEN"]}>
        <EventsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("미확인 이벤트 요약")).toBeTruthy();
    expect(screen.queryByText("확인 완료 이벤트 요약")).toBeNull();
    expect(screen.getByRole("button", { name: "미확인" }).className).toContain("bg-ink");
  });
});
