import { useEffect } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { Bell, ListChecks, CheckCheck, Moon, Sun, Volume2, VolumeX, LogOut, Settings, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { useAuthStore, canAdmin } from "@/store/authStore";
import { useFacilityStore, facilitiesForUser } from "@/store/facilityStore";
import { useUiStore } from "@/store/uiStore";
import {
  DASHBOARD_HOME_PATH,
  dashboardAdminPath,
  dashboardStaffAlertsPath,
  dashboardStaffPath,
  dashboardStaffRoomsPath,
  monitorHomePath,
} from "@/lib/routeAccess";

export function StaffLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { facilityId: routeFacilityId } = useParams<{ facilityId: string }>();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const toggleSound = useUiStore((s) => s.toggleSound);

  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const myFacilities = facilitiesForUser(user?.role === "SUPER_ADMIN" ? null : user?.facilityId ?? null);
  const workspaceFacilityId = routeFacilityId ?? currentFacilityId ?? user?.facilityId ?? "";
  const facility = myFacilities.find((f) => f.id === workspaceFacilityId) ?? myFacilities[0];
  const activeFacilityId = facility?.id ?? workspaceFacilityId;
  const nav = activeFacilityId
    ? [
        { to: dashboardStaffPath(activeFacilityId), label: "지금 확인할 곳", Icon: Bell },
        { to: dashboardStaffRoomsPath(activeFacilityId), label: "전체 방 상태", Icon: ListChecks },
        { to: dashboardStaffAlertsPath(activeFacilityId), label: "확인한 알림", Icon: CheckCheck },
      ]
    : [];

  // 테마 클래스를 이 트리에만 적용 (직원 화면 다크모드)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className={cn("min-h-screen bg-bg", theme === "dark" && "dark")}>
      {/* 상단 바 */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-3">
          <LogoMark size={36} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-lg font-bold text-ink">{facility?.name}</div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto sm:flex-nowrap">
            <IconBtn
              onClick={toggleSound}
              label={soundEnabled ? "소리 알림 켜짐" : "소리 알림 꺼짐"}
            >
              {soundEnabled ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
            </IconBtn>
            <IconBtn onClick={toggleTheme} label={theme === "dark" ? "밝게" : "어둡게"}>
              {theme === "dark" ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
            </IconBtn>
            <button
              onClick={() => activeFacilityId && navigate(monitorHomePath(activeFacilityId))}
              disabled={!activeFacilityId}
              className="ml-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface2 sm:text-base"
            >
              <MonitorPlay className="h-5 w-5" />
              모니터
            </button>
            {canAdmin(user) && (
              <button
                onClick={() =>
                  activeFacilityId && navigate(dashboardAdminPath(activeFacilityId))
                }
                disabled={!activeFacilityId}
                className="ml-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface2 sm:text-base"
              >
                <Settings className="h-5 w-5" />
                관리자 모드
              </button>
            )}
            {user?.role === "SUPER_ADMIN" && (
              <button
                onClick={() => navigate(DASHBOARD_HOME_PATH)}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface2 sm:text-base"
              >
                <Settings className="h-5 w-5" />
                전체 대시보드
              </button>
            )}
            <IconBtn onClick={handleLogout} label="로그아웃">
              <LogOut className="h-6 w-6" />
            </IconBtn>
          </div>
        </div>

        {/* 큰 탭 메뉴 (최대 3개) */}
        <nav className="mx-auto flex max-w-5xl gap-1 px-2 pb-1">
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-t-xl px-3 py-3 text-center text-base font-bold transition-colors sm:text-lg",
                  isActive
                    ? "bg-bg text-brand border-b-[3px] border-brand"
                    : "text-ink-faint hover:text-ink-soft"
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-xl p-2.5 text-ink-soft hover:bg-surface2"
    >
      {children}
    </button>
  );
}
