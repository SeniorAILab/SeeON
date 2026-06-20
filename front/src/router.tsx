import { createBrowserRouter, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { LoginPage } from "@/pages/LoginPage";
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
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";

/** 세션 복원을 보장하는 부트스트랩 래퍼 */
function Bootstrap({ children }: { children: React.ReactNode }) {
  const init = useAuthStore((s) => s.init);
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const resolveForUser = useFacilityStore((s) => s.resolveForUser);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (initialized && user && !currentFacilityId) {
      resolveForUser(user.facilityId);
    }
  }, [initialized, user, currentFacilityId, resolveForUser]);

  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <Bootstrap>
        <LoginPage />
      </Bootstrap>
    ),
  },

  // ---------- 직원 모드 (기본) : 크게 · 단순 · 한글 ----------
  {
    path: "/",
    element: (
      <Bootstrap>
        <RequireAuth>
          <StaffLayout />
        </RequireAuth>
      </Bootstrap>
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
      <Bootstrap>
        <RequireAuth>
          <FloorSelectorPage />
        </RequireAuth>
      </Bootstrap>
    ),
  },
  {
    path: "/monitor/floor/:floorId",
    element: (
      <Bootstrap>
        <RequireAuth>
          <FloorMonitorPage />
        </RequireAuth>
      </Bootstrap>
    ),
  },
  {
    path: "/monitor/all",
    element: (
      <Bootstrap>
        <RequireAuth>
          <FloorMonitorPage allView />
        </RequireAuth>
      </Bootstrap>
    ),
  },

  // ---------- 2층 UX 검증 PoC (개인정보 없음) ----------
  {
    path: "/poc/2f",
    element: (
      <Bootstrap>
        <RequireAuth>
          <PocFloor2Page />
        </RequireAuth>
      </Bootstrap>
    ),
  },

  // ---------- 관리자 모드 : 설정 · 상세 데이터 (FACILITY_ADMIN 이상) ----------
  {
    path: "/admin",
    element: (
      <Bootstrap>
        <RequireAuth minRole="FACILITY_ADMIN">
          <AppLayout />
        </RequireAuth>
      </Bootstrap>
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
