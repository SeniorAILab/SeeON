import type { ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { RouterBootstrap } from "@/components/RouterBootstrap";
import {
  FacilityScope,
  LegacyAdminRedirect,
  LegacyAlertsRedirect,
  LegacyDashboardRedirect,
  LegacyFacilityRedirect,
  LegacyFloorRedirect,
} from "@/components/FacilityRouteScope";
import { RoleRouteRedirect } from "@/components/RoleRouteRedirect";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { SuperAdminDashboardPage } from "@/pages/SuperAdminDashboardPage";
import { AlertsPage } from "@/pages/staff/AlertsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { EventsPage } from "@/pages/EventsPage";
import { AdminEventDetailPage } from "@/pages/admin/AdminEventDetailPage";
import { AdminFacilityPage } from "@/pages/admin/AdminFacilityPage";
import { AdminSpacesPage } from "@/pages/admin/AdminSpacesPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { AdminMonitorSettingsPage } from "@/pages/admin/AdminMonitorSettingsPage";
import { FloorMonitorPage } from "@/pages/monitor/FloorMonitorPage";

const auth = (children: ReactNode, minRole?: "STAFF" | "ADMIN" | "SUPER_ADMIN") => (
  <RouterBootstrap>
    <RequireAuth minRole={minRole}>{children}</RequireAuth>
  </RouterBootstrap>
);

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
  { path: "/", element: auth(<RoleRouteRedirect />) },
  { path: "/facilities", element: auth(<SuperAdminDashboardPage />, "SUPER_ADMIN") },
  {
    path: "/facilities/:facilityId/dashboard",
    element: auth(
      <FacilityScope>
        <StaffLayout />
      </FacilityScope>,
    ),
    children: [{ index: true, element: <FloorMonitorPage allView /> }],
  },
  {
    path: "/facilities/:facilityId/floor/:floorId",
    element: auth(
      <FacilityScope>
        <StaffLayout />
      </FacilityScope>,
    ),
    children: [{ index: true, element: <FloorMonitorPage /> }],
  },
  {
    path: "/facilities/:facilityId/alerts",
    element: auth(
      <FacilityScope>
        <StaffLayout />
      </FacilityScope>,
    ),
    children: [{ index: true, element: <AlertsPage /> }],
  },
  {
    path: "/facilities/:facilityId/admin",
    element: auth(
      <FacilityScope>
        <AppLayout />
      </FacilityScope>,
      "ADMIN",
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "events", element: <EventsPage /> },
      { path: "events/:eventId", element: <AdminEventDetailPage /> },
      { path: "facility", element: <AdminFacilityPage /> },
      { path: "spaces", element: <AdminSpacesPage /> },
      { path: "monitor-settings", element: <AdminMonitorSettingsPage /> },
      { path: "users", element: <UsersPage /> },
    ],
  },
  { path: "/dashboard", element: auth(<LegacyDashboardRedirect />) },
  { path: "/dashboard/floor/:floorId", element: auth(<LegacyFloorRedirect />) },
  { path: "/dashboard/alerts", element: auth(<LegacyAlertsRedirect />) },
  { path: "/admin/*", element: auth(<LegacyAdminRedirect />, "ADMIN") },
  { path: "/dashboard/facilities/:facilityId/:view/*", element: auth(<LegacyFacilityRedirect />) },
  { path: "*", element: auth(<RoleRouteRedirect />) },
]);
