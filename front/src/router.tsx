import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { RouterBootstrap } from "@/components/RouterBootstrap";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
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
import { FloorSelectorPage } from "@/pages/monitor/FloorSelectorPage";
import { FloorMonitorPage } from "@/pages/monitor/FloorMonitorPage";
import { PocFloor2Page } from "@/pages/poc/PocFloor2Page";
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
    path: "/onboarding",
    element: (
      <RouterBootstrap>
        <OnboardingPage />
      </RouterBootstrap>
    ),
  },

  // ---------- 직원 모드 (기본) : 크게 · 단순 · 한글 ----------
  {
    path: "/",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <StaffLayout />
        </RequireAuth>
      </RouterBootstrap>
    ),
    children: [
      { index: true, element: <Navigate to="/now" replace /> },
      { path: "now", element: <NowPage /> },
      { path: "rooms", element: <RoomsPage /> },
      { path: "alerts", element: <AlertsPage /> },
    ],
  },

  // ---------- 모니터(현황판) 모드 : 대형 화면 상시 표시 (로그인 사용자 누구나) ----------
  {
    path: "/monitor",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <FloorSelectorPage />
        </RequireAuth>
      </RouterBootstrap>
    ),
  },
  {
    path: "/monitor/floor/:floorId",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <FloorMonitorPage />
        </RequireAuth>
      </RouterBootstrap>
    ),
  },
  {
    path: "/monitor/all",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <FloorMonitorPage allView />
        </RequireAuth>
      </RouterBootstrap>
    ),
  },

  // ---------- 2층 UX 검증 PoC (개인정보 없음) ----------
  {
    path: "/poc/2f",
    element: (
      <RouterBootstrap>
        <RequireAuth>
          <PocFloor2Page />
        </RequireAuth>
      </RouterBootstrap>
    ),
  },

  // ---------- 관리자 모드 : 설정 · 상세 데이터 (ADMIN 이상) ----------
  {
    path: "/admin",
    element: (
      <RouterBootstrap>
        <RequireAuth minRole="ADMIN">
          <AppLayout />
        </RequireAuth>
      </RouterBootstrap>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
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

  { path: "*", element: <Navigate to="/now" replace /> },
]);
