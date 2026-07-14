import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import { useDashboard } from "@/features/dashboard/hooks/useDashboard";
import type { DashboardResponse } from "@/types";

vi.mock("@/features/dashboard/hooks/useDashboard", () => ({
  useDashboard: vi.fn(),
}));

vi.mock("@/hooks/useActiveFacilityId", () => ({
  useActiveFacilityId: () => "facility-dashboard-test",
}));

vi.mock("@/components/status/RoomStatusBoard", () => ({
  RoomStatusBoard: () => <div />,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

const dashboard: DashboardResponse = {
  facility: { id: "facility-dashboard-test", name: "테스트 요양원", address: "서울" },
  floors: [],
  spaces: [],
  statuses: {},
  summary: { totalSpaces: 0, stable: 0, caution: 0, danger: 0, checkNeeded: 0, unacknowledged: 1 },
  unacknowledgedEvents: [],
};

describe("DashboardPage", () => {
  it("navigates the unacknowledged card to the facility OPEN events filter", () => {
    vi.mocked(useDashboard).mockReturnValue({ data: dashboard, loading: false, reload: vi.fn() });

    render(
      <MemoryRouter initialEntries={["/facilities/facility-dashboard-test/admin/dashboard"]}>
        <DashboardPage />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "미확인 이벤트 1건 보기" }));

    expect(screen.getByTestId("location").textContent).toBe("/facilities/facility-dashboard-test/admin/events?filter=OPEN");
  });
});
