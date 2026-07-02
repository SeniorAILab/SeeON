import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacilityRouteScope } from "@/components/FacilityRouteScope";
import { useAuthStore } from "@/store/authStore";
import { getCurrentFacilityId, useFacilityStore } from "@/store/facilityStore";

function ScopedProbe() {
  const facilityId = getCurrentFacilityId();
  if (facilityId !== "fac_happy_nokyang") {
    throw new Error(`child rendered before facility scope: ${facilityId ?? "null"}`);
  }
  return <div>Scoped {facilityId}</div>;
}

describe("FacilityRouteScope", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({
      user: {
        id: "admin",
        name: "녹양역점 관리자",
        email: "happy8568090@gmail.com",
        role: "ADMIN",
        facilityId: "fac_happy_nokyang",
      },
    });
    useFacilityStore.setState({ currentFacilityId: null, facilities: [] });
  });

  it("waits to render children until the session facility is active in the store", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/admin"]}>
        <Routes>
          <Route
            path="/dashboard/admin"
            element={
              <FacilityRouteScope>
                <ScopedProbe />
              </FacilityRouteScope>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Scoped fac_happy_nokyang");
  });

  it("rehydrates a super-admin active facility from the server session", async () => {
    useAuthStore.setState({
      user: {
        id: "super-admin",
        name: "Senior AI Lab",
        email: "seniorsailab@gmail.com",
        role: "SUPER_ADMIN",
        facilityId: null,
      },
    });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe("/api/v1/facilities/current");
      return new Response(
        JSON.stringify({
          id: "fac_happy_nokyang",
          name: "행복한요양원 녹양역점",
          code: "happy-nokyang",
          address: "경기도 의정부시",
          phone: "031-856-8090",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/dashboard/admin"]}>
        <Routes>
          <Route
            path="/dashboard/admin"
            element={
              <FacilityRouteScope>
                <ScopedProbe />
              </FacilityRouteScope>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Scoped fac_happy_nokyang");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
