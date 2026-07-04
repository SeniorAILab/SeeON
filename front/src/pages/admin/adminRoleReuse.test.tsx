import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "@/router";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import type { User } from "@/types";

vi.mock("@/components/layout/AppLayout", async () => {
  const { Outlet } = await import("react-router-dom");
  return {
    AppLayout: () => (
      <div data-testid="admin-route-shell">
        <Outlet />
      </div>
    ),
  };
});

vi.mock("@/components/layout/StaffLayout", async () => {
  const { Outlet } = await import("react-router-dom");
  return { StaffLayout: () => <Outlet /> };
});

vi.mock("@/pages/AccessDeniedPage", () => ({
  AccessDeniedPage: () => <div>ACCESS_DENIED_PAGE</div>,
}));
vi.mock("@/pages/DashboardPage", () => ({
  DashboardPage: () => <div>ADMIN_DASHBOARD_PAGE</div>,
}));
vi.mock("@/pages/EventsPage", () => ({
  EventsPage: () => <div>ADMIN_EVENTS_PAGE</div>,
}));
vi.mock("@/pages/SuperAdminDashboardPage", () => ({
  SuperAdminDashboardPage: () => <div>SUPER_ADMIN_DASHBOARD_PAGE</div>,
}));
vi.mock("@/pages/admin/AdminEventDetailPage", () => ({
  AdminEventDetailPage: () => <div>ADMIN_EVENT_DETAIL_PAGE</div>,
}));
vi.mock("@/pages/admin/AdminFacilityPage", () => ({
  AdminFacilityPage: () => <div>ADMIN_FACILITY_PAGE</div>,
}));
vi.mock("@/pages/admin/AdminSpacesPage", () => ({
  AdminSpacesPage: () => <div>ADMIN_SPACES_PAGE</div>,
}));
vi.mock("@/pages/admin/UsersPage", () => ({
  UsersPage: () => <div>ADMIN_USERS_PAGE</div>,
}));
vi.mock("@/pages/admin/AdminMonitorSettingsPage", () => ({
  AdminMonitorSettingsPage: () => <div>ADMIN_MONITOR_SETTINGS_PAGE</div>,
}));
vi.mock("@/pages/monitor/FloorMonitorPage", () => ({
  FloorMonitorPage: () => <div>FLOOR_MONITOR_PAGE</div>,
}));
vi.mock("@/pages/LoginPage", () => ({
  LoginPage: () => <div>LOGIN_PAGE</div>,
}));
vi.mock("@/pages/SignupPage", () => ({
  SignupPage: () => <div>SIGNUP_PAGE</div>,
}));
vi.mock("@/pages/OnboardingPage", () => ({
  OnboardingPage: () => <div>ONBOARDING_PAGE</div>,
}));
vi.mock("@/pages/staff/AlertsPage", () => ({
  AlertsPage: () => <div>ALERTS_PAGE</div>,
}));

const superAdmin: User = {
  id: "u-super",
  name: "슈퍼관리자",
  email: "super@example.test",
  role: "SUPER_ADMIN",
  facilityId: null,
};

const staff: User = {
  id: "u-staff",
  name: "요양보호사",
  email: "staff@example.test",
  role: "STAFF",
  facilityId: "fac-1",
};

function setUser(user: User) {
  useAuthStore.setState({
    user,
    initialized: true,
    loading: false,
    error: null,
  });
}

function setFacility(id: string | null) {
  useFacilityStore.setState({
    currentFacilityId: id,
    facilities: [],
  });
}

function renderActualRoutes(entry: string) {
  const memoryRouter = createMemoryRouter(router.routes, { initialEntries: [entry] });
  render(<RouterProvider router={memoryRouter} />);
  return memoryRouter;
}

describe("admin role route reuse", () => {
  beforeEach(() => {
    setFacility(null);
    setUser(superAdmin);
  });

  const activeAdminRouteCases = [
    ["/facilities/fac-1/admin", "ADMIN_DASHBOARD_PAGE"],
    ["/facilities/fac-1/admin/events", "ADMIN_EVENTS_PAGE"],
    ["/facilities/fac-1/admin/events/event-1", "ADMIN_EVENT_DETAIL_PAGE"],
    ["/facilities/fac-1/admin/facility", "ADMIN_FACILITY_PAGE"],
    ["/facilities/fac-1/admin/spaces", "ADMIN_SPACES_PAGE"],
    ["/facilities/fac-1/admin/monitor-settings", "ADMIN_MONITOR_SETTINGS_PAGE"],
    ["/facilities/fac-1/admin/users", "ADMIN_USERS_PAGE"],
  ] as const;

  it.each(activeAdminRouteCases)("SUPER_ADMIN passes %s through the shared admin route shell", async (entry, pageText) => {
    setFacility("fac-1");

    renderActualRoutes(entry);

    expect(await screen.findByTestId("admin-route-shell")).toBeTruthy();
    expect(screen.getByText(pageText)).toBeTruthy();
  });

  it.each(activeAdminRouteCases.map(([entry]) => entry))("STAFF is rejected from %s", async (entry) => {
    setUser(staff);
    setFacility("fac-1");

    const memoryRouter = renderActualRoutes(entry);

    expect(await screen.findByText("ACCESS_DENIED_PAGE")).toBeTruthy();
    expect(memoryRouter.state.location.pathname).toBe("/access-denied");
  });

  it("redirects SUPER_ADMIN without a selected facility from legacy /admin to the picker without selecting a silent default", async () => {
    setFacility(null);

    const setFacilitySpy = vi.spyOn(useFacilityStore.getState(), "setFacility");
    const memoryRouter = renderActualRoutes("/admin");

    expect(await screen.findByText("SUPER_ADMIN_DASHBOARD_PAGE")).toBeTruthy();
    await waitFor(() => expect(memoryRouter.state.location.pathname).toBe("/facilities"));
    expect(setFacilitySpy).not.toHaveBeenCalled();
    expect(useFacilityStore.getState().currentFacilityId).toBeNull();
  });
});
