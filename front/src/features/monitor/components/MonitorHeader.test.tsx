import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MonitorHeader } from "./MonitorHeader";
import type { DashboardSummary, Floor } from "@/types";

const floors: Floor[] = [
  { id: "fl_2f", facilityId: "fac_happy", name: "2F", orderIndex: 2, provisioningSource: "PRODUCT" },
  { id: "fl_1f", facilityId: "fac_happy", name: "1F", orderIndex: 1, provisioningSource: "PRODUCT" },
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

function renderHeader(currentFloorId: string | null = "fl_1f", showAllView = true) {
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
                showAllView={showAllView}
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
  it("hides only the all-floor tab when all-floor viewing is disabled", () => {
    renderHeader("fl_1f", false);

    const floorNav = screen.getByRole("navigation", { name: "층 선택" });
    expect(within(floorNav).queryByRole("button", { name: "전체" })).toBeNull();
    expect(within(floorNav).getAllByRole("button").map((button) => button.textContent)).toEqual(["1F", "2F"]);
  });
});

describe("MonitorHeader — 연결 끊김 알림 벨", () => {
  const disconnected = [
    { spaceId: "sp_205", name: "205호", lastSeenAt: "2026-08-01T06:47:44.174Z" },
    { spaceId: "sp_301", name: "301호", lastSeenAt: null },
  ];

  function renderWithBell(rooms: typeof disconnected) {
    return render(
      <MemoryRouter initialEntries={["/facilities/fac_happy/floor/fl_1f"]}>
        <Routes>
          <Route
            path="*"
            element={
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
                currentFloorId="fl_1f"
                facilityId="fac_happy"
                disconnectedRooms={rooms}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );
  }

  it("끊긴 카메라 수가 벨 배지에 숫자로 보인다", () => {
    renderWithBell(disconnected);

    const bell = screen.getByRole("button", { name: "카메라 2대 연결 끊김" });
    expect(within(bell).getByText("2")).not.toBeNull();
  });

  it("끊긴 카메라가 없으면 배지를 띄우지 않는다", () => {
    renderWithBell([]);

    const bell = screen.getByRole("button", { name: "카메라 연결 이상 없음" });
    expect(within(bell).queryByText("0")).toBeNull();
  });

  it("벨을 누르면 방 이름과 마지막 확인 시각이 목록으로 열린다", () => {
    renderWithBell(disconnected);

    fireEvent.click(screen.getByRole("button", { name: "카메라 2대 연결 끊김" }));

    const panel = screen.getByRole("dialog", { name: "연결 끊긴 카메라" });
    expect(within(panel).getByText("205호")).not.toBeNull();
    expect(within(panel).getByText("301호")).not.toBeNull();
    expect(within(panel).getByText("확인된 적 없음")).not.toBeNull();
  });

  it("상단 가로 배너는 만들지 않는다 — 정보는 벨 안에만 있다", () => {
    renderWithBell(disconnected);

    // 드롭다운을 열기 전에는 방 이름이 화면 어디에도 노출되지 않는다.
    expect(screen.queryByText("205호")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
