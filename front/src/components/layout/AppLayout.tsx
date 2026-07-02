import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  Layers,
  DoorOpen,
  BedDouble,
  ShieldAlert,
  Users as UsersIcon,
  LayoutGrid,
  MonitorPlay,
  Heart,
  FlaskConical,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { canAdmin } from "@/lib/roles";
import { useFacilityStore, facilitiesForUser } from "@/store/facilityStore";
import { listFacilities, selectFacility } from "@/services/api/dashboardEndpoints";
import {
  DASHBOARD_HOME_PATH,
  dashboardAdminPath,
  dashboardStaffPath,
  monitorHomePath,
} from "@/lib/routeAccess";
import { AppHeader } from "./AppHeader";
import { AppSidebar, type AppNavItem } from "./AppSidebar";

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [facilitySelectorError, setFacilitySelectorError] = useState<string | null>(null);
  const userFacilityId = user?.facilityId ?? null;
  const userId = user?.id;
  const userRole = user?.role;

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const currentFacilityId = useFacilityStore((state) => state.currentFacilityId);
  const facilities = useFacilityStore((state) => state.facilities);
  const setFacility = useFacilityStore((state) => state.setFacility);
  const setFacilities = useFacilityStore((state) => state.setFacilities);

  useEffect(() => {
    if (!userId) {
      setFacilities([]);
      return;
    }

    let cancelled = false;
    listFacilities()
      .then((nextFacilities) => {
        if (!cancelled) {
          setFacilities(nextFacilities);
          setFacilitySelectorError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setFacilities([]);
          setFacilitySelectorError(
            caught instanceof Error ? caught.message : "시설 목록을 불러오지 못했습니다."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setFacilities, userFacilityId, userId, userRole]);

  const myFacilities = facilitiesForUser(
    userRole === "SUPER_ADMIN" ? null : userFacilityId,
    facilities,
  );
  const workspaceFacilityId = currentFacilityId ?? userFacilityId ?? "";
  const currentFacility = myFacilities.find((facility) => facility.id === workspaceFacilityId) ?? null;
  const activeFacilityId = currentFacility?.id ?? workspaceFacilityId;
  const adminBase = dashboardAdminPath();
  const canOpenAdminSections = canAdmin(user);
  const nav: readonly AppNavItem[] = activeFacilityId
    ? [
        { to: adminBase, label: "상세 대시보드", Icon: LayoutGrid, show: true },
        { to: `${adminBase}/events`, label: "이벤트", Icon: Bell, show: true },
        { to: `${adminBase}/focus-residents`, label: "관심 어르신", Icon: Heart, show: true },
        { to: `${adminBase}/monitor-settings`, label: "모니터 설정", Icon: MonitorPlay, show: canOpenAdminSections },
        { to: `${adminBase}/ux-test`, label: "UX 테스트 결과", Icon: FlaskConical, show: true },
        { to: `${adminBase}/facility`, label: "시설 설정", Icon: Building2, show: canOpenAdminSections },
        { to: `${adminBase}/floors`, label: "층 관리", Icon: Layers, show: canOpenAdminSections },
        { to: `${adminBase}/spaces`, label: "공간 관리", Icon: DoorOpen, show: canOpenAdminSections },
        { to: `${adminBase}/assignments`, label: "구역/침대 배정", Icon: BedDouble, show: canOpenAdminSections },
        { to: `${adminBase}/alert-rules`, label: "알림 규칙", Icon: ShieldAlert, show: canOpenAdminSections },
        { to: `${adminBase}/users`, label: "사용자", Icon: UsersIcon, show: canOpenAdminSections },
      ].filter((item) => item.show)
    : [];

  async function selectWorkspaceFacility(optionValue: string): Promise<void> {
    if (!optionValue) return;
    if (userRole === "SUPER_ADMIN") {
      const selected = myFacilities.find((facility) => facility.selectionToken === optionValue);
      if (!selected?.selectionToken) {
        setFacilitySelectorError("시설 선택 토큰이 없습니다. 다시 로그인해 주세요.");
        return;
      }
      setFacilitySelectorError(null);
      try {
        const facility = await selectFacility(selected.selectionToken);
        setFacility(facility.id);
        navigate(dashboardAdminPath());
      } catch (caught) {
        setFacilitySelectorError(
          caught instanceof Error ? caught.message : "시설 선택에 실패했습니다."
        );
      }
      return;
    }
    setFacility(optionValue);
    navigate(dashboardAdminPath());
  }

  async function handleLogout(): Promise<void> {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <AppSidebar
        mobileOpen={mobileOpen}
        nav={nav}
        user={user}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={() => {
          void handleLogout();
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          activeFacilityId={activeFacilityId}
          currentFacility={currentFacility}
          facilitySelectorError={facilitySelectorError}
          mobileOpen={mobileOpen}
          myFacilities={myFacilities}
          userRole={userRole}
          workspaceFacilityId={workspaceFacilityId}
          onOpenDashboardHome={() => navigate(DASHBOARD_HOME_PATH)}
          onOpenMonitor={() => navigate(monitorHomePath())}
          onOpenStaffMode={() => navigate(dashboardStaffPath())}
          onSelectWorkspaceFacility={(optionValue) => {
            void selectWorkspaceFacility(optionValue);
          }}
          onToggleMobile={() => setMobileOpen((isOpen) => !isOpen)}
        />
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
