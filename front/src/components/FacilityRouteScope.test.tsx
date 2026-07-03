import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacilityScope, LegacyFacilityRedirect } from "@/components/FacilityRouteScope";
import { useAuthStore } from "@/store/authStore";
import { getCurrentFacilityId, useFacilityStore } from "@/store/facilityStore";

function LocationProbe() {
  const location = useLocation();
  return <div>PATH:{location.pathname}</div>;
}

function ScopedProbe() {
  const facilityId = getCurrentFacilityId();
  return <div>Scoped {facilityId}</div>;
}

const superAdmin = {
  id: "super-admin",
  name: "Senior AI Lab",
  email: "seniorsailab@gmail.com",
  role: "SUPER_ADMIN" as const,
  facilityId: null,
};

describe("FacilityScope", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useAuthStore.setState({ user: superAdmin });
    useFacilityStore.setState({ currentFacilityId: null, facilities: [] });
  });

  it.each(["/admin", "/dashboard/floor/fl-2f", "/dashboard/alerts"])(
    "guards super admin facility route %s without silent defaulting",
    async (entry) => {
      const setFacility = vi.spyOn(useFacilityStore.getState(), "setFacility");
      render(
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/admin" element={<FacilityScope><ScopedProbe /></FacilityScope>} />
            <Route path="/dashboard/floor/:floorId" element={<FacilityScope><ScopedProbe /></FacilityScope>} />
            <Route path="/dashboard/alerts" element={<FacilityScope><ScopedProbe /></FacilityScope>} />
            <Route path="/dashboard" element={<div>Global overview</div>} />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByText("Global overview")).toBeTruthy();
      expect(setFacility).not.toHaveBeenCalled();
    },
  );

  it("sets legacy facility scope before replacing and before child/API work", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryRouter initialEntries={["/dashboard/facilities/fac-a/admin/events"]}>
        <Routes>
          <Route path="/dashboard/facilities/:facilityId/:view/*" element={<LegacyFacilityRedirect />} />
          <Route path="/admin/events" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("PATH:/admin/events")).toBeTruthy();
    expect(useFacilityStore.getState().currentFacilityId).toBe("fac-a");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unauthorized legacy facility before rendering target children", async () => {
    useAuthStore.setState({ user: { ...superAdmin, role: "ADMIN", facilityId: "fac-own" } });
    render(
      <MemoryRouter initialEntries={["/dashboard/facilities/fac-other/admin/events"]}>
        <Routes>
          <Route path="/dashboard/facilities/:facilityId/:view/*" element={<LegacyFacilityRedirect />} />
          <Route path="/admin/events" element={<div>Child rendered</div>} />
          <Route path="/access-denied" element={<div>Denied</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Denied")).toBeTruthy();
    expect(screen.queryByText("Child rendered")).toBeNull();
  });
});
