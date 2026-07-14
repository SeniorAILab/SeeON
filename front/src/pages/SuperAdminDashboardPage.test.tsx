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
  address: "",
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/v1/facilities");
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
  it("disambiguates duplicate facility cards with an address or ID suffix", async () => {
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
    expect(screen.getByText("시설 ID: orphan")).toBeTruthy();
  });
});
