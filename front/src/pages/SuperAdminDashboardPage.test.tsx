import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SuperAdminDashboardPage } from "./SuperAdminDashboardPage";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
const SCOPED_FACILITY_ID = "fac_happy_nokyang";
const DUPLICATE_FACILITY_NAME = "행복한요양원 녹양역점";


const seededFacility = {
  id: SCOPED_FACILITY_ID,
  name: DUPLICATE_FACILITY_NAME,
  address: "경기도 의정부시 녹양로 12",
  phone: "031-123-4567",
};
const orphanDuplicateFacility = {
  id: "facility-orphan",
  name: DUPLICATE_FACILITY_NAME,
  address: null,
  phone: "031-000-0000",
};

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useFacilityStore.setState({ currentFacilityId: null });
  useAuthStore.setState({
    user: {
      id: "user-super",
      name: "SeniorAILab Super Admin",
      email: "seniorsailab@gmail.com",
      role: "SUPER_ADMIN",
      facilityId: null,
    },
    initialized: true,
    loading: false,
    error: null,
    logout: vi.fn(),
  });
});

describe("SuperAdminDashboardPage", () => {
  it("renders the facility selector and only the available facility count without preloading facility-scoped dashboard APIs", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/facilities")) return okJsonResponse([seededFacility]);
      if (url.endsWith("/cameras")) return okJsonResponse([]);
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <SuperAdminDashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "요양원 전역 개요" })).toBeTruthy();
    expect(await screen.findByText("행복한요양원 녹양역점")).toBeTruthy();
    expect(screen.getByText("요양원")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.queryByText("공간")).toBeNull();
    expect(screen.queryByText("미확인")).toBeNull();
    expect(screen.queryByText("층")).toBeNull();
    expect(screen.queryByText("알림")).toBeNull();
    expect(screen.queryByText("-")).toBeNull();
    expect(screen.queryByText("대시보드 연결 실패")).toBeNull();
    // 시설 목록 + 카메라 건강상태만 부른다. 시설 스코프 대시보드 API를
    // 미리 당겨오지 않는다는 원래 의도는 그대로다.
    const requested = fetchMock.mock.calls.map((call) => String(call[0])).sort();
    expect(requested).toEqual(["/api/v1/cameras", "/api/v1/facilities"]);
  });
  it("renders a friendly fallback instead of a raw API error body when facilities fail to load", async () => {
    const rawError = JSON.stringify({ error: "Internal Server Error", statusCode: 500 });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(rawError, {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <SuperAdminDashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("시설 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.")).toBeTruthy();
    expect(screen.queryByText(rawError)).toBeNull();
  });

  it("stores the selected facility before entering a facility-scoped route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => okJsonResponse([seededFacility]))
    );

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <SuperAdminDashboardPage />
      </MemoryRouter>
    );

    const adminButtons = await screen.findAllByRole("button", { name: /관리자 화면/ });
    fireEvent.click(adminButtons[0]);

    await waitFor(() =>
      expect(useFacilityStore.getState().currentFacilityId).toBe(SCOPED_FACILITY_ID)
    );
  });
  it("disambiguates duplicate facility names by always showing the full facility ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        okJsonResponse([seededFacility, orphanDuplicateFacility]),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <SuperAdminDashboardPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findAllByRole("heading", { name: DUPLICATE_FACILITY_NAME }),
    ).toHaveLength(2);
    expect(screen.getByText("경기도 의정부시 녹양로 12")).toBeTruthy();
    // 이름이 겹칠 때만 끝 6자리를 보여주던 것을 폐기했다. 기사님이 엣지 연결
    // 설정에 붙여넣어야 하므로 항상 전체 ID를 노출한다.
    expect(
      screen.getByTestId(`facility-id-${orphanDuplicateFacility.id}`).textContent,
    ).toBe(orphanDuplicateFacility.id);
    expect(
      screen.getByTestId(`facility-id-${SCOPED_FACILITY_ID}`).textContent,
    ).toBe(SCOPED_FACILITY_ID);
  });
});

describe("I11 — 기사 인계용 시설 ID", () => {
  function renderWithFacilities() {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => okJsonResponse([seededFacility]))
    );
    return render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <SuperAdminDashboardPage />
      </MemoryRouter>
    );
  }

  it("시설 ID를 끝 6자리가 아니라 전체로 보여준다", async () => {
    renderWithFacilities();

    const idNode = await screen.findByTestId(`facility-id-${SCOPED_FACILITY_ID}`);
    expect(idNode.textContent).toBe(SCOPED_FACILITY_ID);
  });

  it("복사 버튼이 전체 시설 ID를 클립보드에 넣는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    renderWithFacilities();

    const copyBtn = await screen.findByRole("button", {
      name: `${DUPLICATE_FACILITY_NAME} 시설 ID 복사`,
    });
    fireEvent.click(copyBtn);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SCOPED_FACILITY_ID));
  });

  it("클립보드 권한이 없어도 ID는 화면에 그대로 남는다", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
      writable: true,
    });

    renderWithFacilities();

    const copyBtn = await screen.findByRole("button", {
      name: `${DUPLICATE_FACILITY_NAME} 시설 ID 복사`,
    });
    fireEvent.click(copyBtn);

    await waitFor(() =>
      expect(
        screen.getByTestId(`facility-id-${SCOPED_FACILITY_ID}`).textContent
      ).toBe(SCOPED_FACILITY_ID)
    );
  });
});

describe("I12 — 전역 카메라 건강상태", () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const justNow = new Date().toISOString();

  function stubFetch(cameras: unknown[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        if (url.endsWith("/cameras")) return okJsonResponse(cameras);
        return okJsonResponse([seededFacility]);
      })
    );
  }

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <SuperAdminDashboardPage />
      </MemoryRouter>
    );
  }

  it("끊긴 카메라 수를 전역 화면에서 먼저 보여준다", async () => {
    stubFetch([
      { id: "c1", facilityId: SCOPED_FACILITY_ID, spaceId: "sp_1", online: true, lastSeenAt: justNow },
      { id: "c2", facilityId: SCOPED_FACILITY_ID, spaceId: "sp_2", online: true, lastSeenAt: twoDaysAgo },
      { id: "c3", facilityId: SCOPED_FACILITY_ID, spaceId: "sp_3", online: true, lastSeenAt: null },
    ]);

    renderPage();

    const stale = await screen.findByTestId("camera-health-stale");
    // online=true여도 lastSeenAt 기준으로 2건이 끊김이다.
    expect(stale.textContent).toContain("2");
  });

  it("전부 살아 있으면 끊김 0으로 표시한다", async () => {
    stubFetch([
      { id: "c1", facilityId: SCOPED_FACILITY_ID, spaceId: "sp_1", online: true, lastSeenAt: justNow },
    ]);

    renderPage();

    const stale = await screen.findByTestId("camera-health-stale");
    expect(stale.textContent).toContain("0");
  });

  it("카메라 조회가 실패해도 시설 목록은 그대로 보인다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        if (url.endsWith("/cameras")) throw new Error("boom");
        return okJsonResponse([seededFacility]);
      })
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: DUPLICATE_FACILITY_NAME })
    ).toBeTruthy();
    expect(screen.queryByTestId("camera-health-stale")).toBeNull();
  });
});
