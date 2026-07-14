import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

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
  it("defaults to all events when the filter query parameter is absent", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/events"]}>
        <EventsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("미확인 이벤트 요약")).toBeTruthy();
    expect(screen.getByText("확인 완료 이벤트 요약")).toBeTruthy();
    expect(screen.getByRole("button", { name: "전체" }).className).toContain("bg-ink");
  });

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

  it("updates the URL and visible events when a filter is selected", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/events"]}>
        <EventsPage />
        <LocationProbe />
      </MemoryRouter>
    );

    await screen.findByText("미확인 이벤트 요약");
    fireEvent.click(screen.getByRole("button", { name: "미확인" }));

    expect(screen.getByTestId("location").textContent).toBe("/admin/events?filter=OPEN");
    expect(screen.getByText("미확인 이벤트 요약")).toBeTruthy();
    expect(screen.queryByText("확인 완료 이벤트 요약")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(screen.getByTestId("location").textContent).toBe("/admin/events");
    expect(screen.getByText("확인 완료 이벤트 요약")).toBeTruthy();
  });

  it("falls back to all events for an invalid filter query parameter", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/events?filter=NOT_A_FILTER"]}>
        <EventsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("미확인 이벤트 요약")).toBeTruthy();
    expect(screen.getByText("확인 완료 이벤트 요약")).toBeTruthy();
    expect(screen.getByRole("button", { name: "전체" }).className).toContain("bg-ink");
  });
});
