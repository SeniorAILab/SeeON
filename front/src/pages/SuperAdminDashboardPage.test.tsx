import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SuperAdminDashboardPage } from "./SuperAdminDashboardPage";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";

const seededFacility = {
  id: "fac_happy_nokyang",
  name: "행복한요양원 녹양역점",
  code: "happy-nokyang",
  address: "경기도 의정부시 녹양로 12",
  phone: "031-123-4567",
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
  it("renders the facility selector without preloading facility-scoped dashboard APIs", async () => {
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
    expect(screen.queryByText("대시보드 연결 실패")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/v1/facilities");
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
      expect(useFacilityStore.getState().currentFacilityId).toBe("fac_happy_nokyang")
    );
  });
});
