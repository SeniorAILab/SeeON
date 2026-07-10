import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MonitorHeader } from "./MonitorHeader";
import type { DashboardSummary, Floor } from "@/types";

const floors: Floor[] = [
  { id: "fl_2f", facilityId: "fac_happy", name: "2F", orderIndex: 2 },
  { id: "fl_1f", facilityId: "fac_happy", name: "1F", orderIndex: 1 },
];

const summary: DashboardSummary = {
  totalSpaces: 0,
  stable: 0,
  caution: 0,
  danger: 0,
  checkNeeded: 0,
  unacknowledged: 0,
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderHeader(currentFloorId: string | null = "fl_1f") {
  return render(
    <MemoryRouter initialEntries={["/facilities/fac_happy/floor/fl_1f"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <MonitorHeader
                facilityName="해피 요양원"
                floorTitle="1F 생활실"
                summary={summary}
                totalPeople={0}
                connection="NORMAL"
                lastUpdateAt={null}
                soundEnabled={false}
                onToggleSound={vi.fn()}
                onRefresh={vi.fn()}
                fullscreenRef={createRef<HTMLElement>()}
                floors={floors}
                currentFloorId={currentFloorId}
                facilityId="fac_happy"
              />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("MonitorHeader floor selector", () => {
  it("renders sorted floor tabs and marks the current floor", () => {
    renderHeader("fl_1f");

    const floorNav = screen.getByRole("navigation", { name: "층 선택" });
    const tabs = within(floorNav).getAllByRole("button").map((button) => button.textContent);

    expect(tabs).toEqual(["전체", "1F", "2F"]);
    expect(within(floorNav).getByRole("button", { name: "1F" }).getAttribute("aria-current")).toBe("page");
  });

  it("navigates to a selected floor and all-floor dashboard", () => {
    renderHeader("fl_1f");

    const floorNav = screen.getByRole("navigation", { name: "층 선택" });
    fireEvent.click(within(floorNav).getByRole("button", { name: "2F" }));
    expect(screen.getByTestId("location").textContent).toBe("/facilities/fac_happy/floor/fl_2f");

    fireEvent.click(within(floorNav).getByRole("button", { name: "전체" }));
    expect(screen.getByTestId("location").textContent).toBe("/facilities/fac_happy/dashboard");
  });

  it("marks all floors active when currentFloorId is null", () => {
    renderHeader(null);

    const floorNav = screen.getByRole("navigation", { name: "층 선택" });
    expect(within(floorNav).getByRole("button", { name: "전체" }).getAttribute("aria-current")).toBe("page");
  });
});
