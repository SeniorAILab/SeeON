import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FacilityScope,
  LegacyAdminRedirect,
  LegacyAlertsRedirect,
  LegacyDashboardRedirect,
  LegacyFacilityRedirect,
  LegacyFloorRedirect,
} from "@/components/FacilityRouteScope";
import { useAuthStore } from "@/stores/authStore";
import { getCurrentFacilityId, useFacilityStore } from "@/stores/facilityStore";

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

  it.each([
    "/facilities/fac-a/admin",
    "/facilities/fac-a/floor/fl-2f",
    "/facilities/fac-a/alerts",
  ])("sets facility scope from URL before rendering %s", async (entry) => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/facilities/:facilityId/admin" element={<FacilityScope><ScopedProbe /></FacilityScope>} />
          <Route path="/facilities/:facilityId/floor/:floorId" element={<FacilityScope><ScopedProbe /></FacilityScope>} />
          <Route path="/facilities/:facilityId/alerts" element={<FacilityScope><ScopedProbe /></FacilityScope>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Scoped fac-a")).toBeTruthy();
  });

  it("rejects a non-super-admin facility mismatch", async () => {
    useAuthStore.setState({ user: { ...superAdmin, role: "ADMIN", facilityId: "fac-own" } });
    render(
      <MemoryRouter initialEntries={["/facilities/fac-other/admin"]}>
        <Routes>
          <Route path="/facilities/:facilityId/admin" element={<FacilityScope><ScopedProbe /></FacilityScope>} />
          <Route path="/access-denied" element={<div>Denied</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Denied")).toBeTruthy();
  });

  it.each([
    ["/dashboard", "/facilities/fac-a/dashboard"],
    ["/dashboard/floor/fl-2f", "/facilities/fac-a/floor/fl-2f"],
    ["/dashboard/alerts", "/facilities/fac-a/alerts"],
    ["/admin", "/facilities/fac-a/admin"],
    ["/admin/events", "/facilities/fac-a/admin/events"],
    ["/admin/events/evt-1", "/facilities/fac-a/admin/events/evt-1"],
    ["/admin/facility", "/facilities/fac-a/admin/facility"],
    ["/admin/spaces", "/facilities/fac-a/admin/spaces"],
    ["/admin/monitor-settings", "/facilities/fac-a/admin/monitor-settings"],
    ["/admin/users", "/facilities/fac-a/admin/users"],
    ["/dashboard/facilities/fac-a/staff", "/facilities/fac-a/dashboard"],
    ["/dashboard/facilities/fac-a/staff/alerts", "/facilities/fac-a/alerts"],
    ["/dashboard/facilities/fac-a/staff/floors/fl-2f", "/facilities/fac-a/floor/fl-2f"],
    ["/dashboard/facilities/fac-a/admin", "/facilities/fac-a/admin"],
    ["/dashboard/facilities/fac-a/admin/events", "/facilities/fac-a/admin/events"],
    ["/dashboard/facilities/fac-a/admin/events/evt-1", "/facilities/fac-a/admin/events/evt-1"],
    ["/dashboard/facilities/fac-a/admin/facility", "/facilities/fac-a/admin/facility"],
    ["/dashboard/facilities/fac-a/admin/spaces", "/facilities/fac-a/admin/spaces"],
    ["/dashboard/facilities/fac-a/admin/monitor-settings", "/facilities/fac-a/admin/monitor-settings"],
    ["/dashboard/facilities/fac-a/admin/users", "/facilities/fac-a/admin/users"],
  ])("redirects legacy route %s to %s", async (entry, expected) => {
    useFacilityStore.setState({ currentFacilityId: "fac-a", facilities: [] });
    renderLegacy(entry);

    expect(await screen.findByText(`PATH:${expected}`)).toBeTruthy();
  });

  it("sends super admin legacy dashboard without current facility to picker without looping", async () => {
    renderLegacy("/dashboard");

    expect(await screen.findByText("PATH:/facilities")).toBeTruthy();
  });

  it("sets legacy facility scope before replacing and before child/API work", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    renderLegacy("/dashboard/facilities/fac-a/admin/events");

    expect(await screen.findByText("PATH:/facilities/fac-a/admin/events")).toBeTruthy();
    expect(useFacilityStore.getState().currentFacilityId).toBe("fac-a");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unauthorized legacy facility before rendering target children", async () => {
    useAuthStore.setState({ user: { ...superAdmin, role: "ADMIN", facilityId: "fac-own" } });
    renderLegacy("/dashboard/facilities/fac-other/admin/events");

    expect(await screen.findByText("Denied")).toBeTruthy();
    expect(screen.queryByText("Child rendered")).toBeNull();
  });
});

function renderLegacy(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/dashboard" element={<LegacyDashboardRedirect />} />
        <Route path="/dashboard/floor/:floorId" element={<LegacyFloorRedirect />} />
        <Route path="/dashboard/alerts" element={<LegacyAlertsRedirect />} />
        <Route path="/admin/*" element={<LegacyAdminRedirect />} />
        <Route path="/dashboard/facilities/:facilityId/:view/*" element={<LegacyFacilityRedirect />} />
        <Route path="/facilities" element={<LocationProbe />} />
        <Route path="/facilities/:facilityId/dashboard" element={<LocationProbe />} />
        <Route path="/facilities/:facilityId/floor/:floorId" element={<LocationProbe />} />
        <Route path="/facilities/:facilityId/alerts" element={<LocationProbe />} />
        <Route path="/facilities/:facilityId/admin/*" element={<><LocationProbe /><div>Child rendered</div></>} />
        <Route path="/access-denied" element={<div>Denied</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
