import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import type { Facility } from "@/types";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const nokyangFacility: Facility = {
  id: "fac_happy_nokyang",
  name: "행복한요양원 녹양역점",
  code: "happy-nokyang",
  address: "경기도 의정부시",
  phone: "031-856-8090",
};

const backendOnlyFacility: Facility = {
  id: "fac_backend_only",
  name: "백엔드 시설",
  code: "backend-only",
  address: "서울특별시",
  phone: "02-000-0000",
};

describe("AppLayout facility selector", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({
      user: {
        id: "super-admin",
        name: "Senior AI Lab",
        email: "seniorsailab@gmail.com",
        role: "SUPER_ADMIN",
        facilityId: null,
      },
    });
    useFacilityStore.setState({
      currentFacilityId: "fac_happy_nokyang",
      facilities: [],
    });
  });

  it("uses backend facilities instead of mock facility fallback", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJsonResponse([nokyangFacility, backendOnlyFacility]));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={<AppLayout />}
          >
            <Route index element={<div>Admin child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const selector = await screen.findByRole("combobox");
    if (!(selector instanceof HTMLSelectElement)) {
      throw new Error("facility selector was not a select element");
    }

    expect(Array.from(selector.options).map((option) => option.value)).toEqual([
      "__global__",
      "fac_happy_nokyang",
      "fac_backend_only",
    ]);
    expect(screen.queryByText("맑은 의정부점")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/facilities",
      expect.objectContaining({
        headers: expect.not.objectContaining({
          "x-facility-id": "fac_happy_nokyang",
        }),
      })
    );
    expect(screen.queryByText(/\d{2}:\d{2}/)).toBeNull();
    expect(screen.getAllByText("대시보드")).toHaveLength(1);
    expect(screen.queryByText("원장님")).toBeNull();
  });
});
