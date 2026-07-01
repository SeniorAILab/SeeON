import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { RouterBootstrap } from "@/components/RouterBootstrap";
import { FacilityRouteScope } from "@/components/FacilityRouteScope";
import { RoleRouteRedirect } from "@/components/RoleRouteRedirect";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { SuperAdminDashboardPage } from "@/pages/SuperAdminDashboardPage";
import { NowPage } from "@/pages/staff/NowPage";
import { RoomsPage } from "@/pages/staff/RoomsPage";
import { AlertsPage } from "@/pages/staff/AlertsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { EventsPage } from "@/pages/EventsPage";
import { AdminEventDetailPage } from "@/pages/admin/AdminEventDetailPage";
import { AdminFacilityPage } from "@/pages/admin/AdminFacilityPage";
import { AdminFloorsPage } from "@/pages/admin/AdminFloorsPage";
import { AdminSpacesPage } from "@/pages/admin/AdminSpacesPage";
import { AdminAlertRulesPage } from "@/pages/admin/AdminAlertRulesPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { AdminMonitorSettingsPage } from "@/pages/admin/AdminMonitorSettingsPage";
import { FocusResidentsPage } from "@/pages/admin/FocusResidentsPage";
import { AdminAssignmentsPage } from "@/pages/admin/AdminAssignmentsPage";
import { FloorMonitorPage } from "@/pages/monitor/FloorMonitorPage";
import { UxTestResultPage } from "@/pages/admin/UxTestResultPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <RouterBootstrap>
        <LoginPage />
      </RouterBootstrap>
    ),
  },
  {
    path: "/signup",
    element: (
      <RouterBootstrap>
        <SignupPage />
      </RouterBootstrap>
    ),
  },
  {
    path: "/access-denied",
    element: (
      <RouterBootstrap>
        <AccessDeniedPage />
      </RouterBootstrap>
    ),
  },
  {
    path: "/onboarding",
    element: (
      <RouterBootstrap>
        <OnboardingPage />
      </RouterBootstrap>
    ),
  },

  {
    path: "/",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <RoleRouteRedirect />
        </RequireAuth>
      </RouterBootstrap>
    ),
  },
  {
    path: "/dashboard",
    element: (
      <RouterBootstrap>
        <RequireAuth minRole="SUPER_ADMIN">
          <SuperAdminDashboardPage />
        </RequireAuth>
      </RouterBootstrap>
    ),
  },
  {
    path: "/dashboard/facilities/:facilityId/staff",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <FacilityRouteScope>
            <StaffLayout />
          </FacilityRouteScope>
        </RequireAuth>
      </RouterBootstrap>
    ),
    children: [
      { index: true, element: <NowPage /> },
      { path: "rooms", element: <RoomsPage /> },
      { path: "alerts", element: <AlertsPage /> },
    ],
  },
  {
    path: "/monitor/:facilityId",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <FacilityRouteScope>
            <FloorMonitorPage allView />
          </FacilityRouteScope>
        </RequireAuth>
      </RouterBootstrap>
    ),
  },
  {
    path: "/monitor/:facilityId/floors/:floorId",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <FacilityRouteScope>
            <FloorMonitorPage />
          </FacilityRouteScope>
        </RequireAuth>
      </RouterBootstrap>
    ),
  },
  {
    path: "/dashboard/facilities/:facilityId/admin",
    element: (
      <RouterBootstrap>
        <RequireAuth minRole="FACILITY_ADMIN">
          <FacilityRouteScope>
            <AppLayout />
          </FacilityRouteScope>
        </RequireAuth>
      </RouterBootstrap>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "events", element: <EventsPage /> },
      { path: "events/:eventId", element: <AdminEventDetailPage /> },
      { path: "focus-residents", element: <FocusResidentsPage /> },
      { path: "facility", element: <AdminFacilityPage /> },
      { path: "floors", element: <AdminFloorsPage /> },
      { path: "spaces", element: <AdminSpacesPage /> },
      { path: "assignments", element: <AdminAssignmentsPage /> },
      { path: "alert-rules", element: <AdminAlertRulesPage /> },
      { path: "monitor-settings", element: <AdminMonitorSettingsPage /> },
      { path: "ux-test", element: <UxTestResultPage /> },
      { path: "users", element: <UsersPage /> },
    ],
  },

  {
    path: "*",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <RoleRouteRedirect />
        </RequireAuth>
      </RouterBootstrap>
    ),
  },
]);
