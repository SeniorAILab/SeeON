import { useEffect, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { CheckCheck, Moon, Sun, Volume2, VolumeX, LogOut, Settings, MonitorPlay, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import { canAdmin, roleLabel } from "@/lib/roles";
import { useFacilityStore, facilitiesForUser } from "@/store/facilityStore";
import { useUiStore } from "@/store/uiStore";
import { listFacilities } from "@/services/api/dashboardEndpoints";
import { adminPath, alertsPath, dashboardPath } from "@/lib/routeAccess";

export function StaffLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const toggleSound = useUiStore((s) => s.toggleSound);
  const userFacilityId = user?.facilityId ?? null;
  const userId = user?.id;
  const userRole = user?.role;

  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilities = useFacilityStore((s) => s.facilities);
  const setFacilities = useFacilityStore((s) => s.setFacilities);
  const switchFacility = useFacilityStore((s) => s.switchFacility);

  useEffect(() => {
    if (!userId) {
      setFacilities([]);
      return;
    }
    let cancelled = false;
    listFacilities()
      .then((nextFacilities) => {
        if (!cancelled) setFacilities(nextFacilities);
      })
      .catch(() => {
        if (!cancelled) setFacilities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [setFacilities, userId, userRole, userFacilityId]);

  const myFacilities = facilitiesForUser(
    userRole === "SUPER_ADMIN" ? null : userFacilityId,
    facilities,
  );
  const activeFacilityId = userRole === "SUPER_ADMIN" ? currentFacilityId : userFacilityId;
  const facility = myFacilities.find((f) => f.id === activeFacilityId) ?? null;
  const facilityLabel = facility?.name ?? activeFacilityId ?? "전역 개요";
  const nav = [
    { to: dashboardPath(), label: "대시보드", Icon: MonitorPlay },
    { to: alertsPath(), label: "확인한 알림", Icon: CheckCheck },
  ];

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  async function handleLogout() {
    switchFacility(null);
    await logout();
    navigate("/login");
  }

  return (
    <div className={cn("min-h-screen bg-bg", theme === "dark" && "dark")}>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-3">
          <LogoMark size={36} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center gap-2 truncate text-lg font-bold text-ink">
              <Building2 className="h-5 w-5 shrink-0 text-ink-soft" />
              <span className="truncate">{facilityLabel}</span>
            </div>
            <div className="text-xs font-semibold text-ink-soft">{user ? roleLabel(user.role) : ""}</div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto sm:flex-nowrap">
            <IconBtn onClick={toggleSound} label={soundEnabled ? "소리 알림 켜짐" : "소리 알림 꺼짐"}>
              {soundEnabled ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
            </IconBtn>
            <IconBtn onClick={toggleTheme} label={theme === "dark" ? "밝게" : "어둡게"}>
              {theme === "dark" ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
            </IconBtn>
            <button
              onClick={() => navigate(dashboardPath())}
              className="ml-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface2 sm:text-base"
            >
              <MonitorPlay className="h-5 w-5" />
              대시보드
            </button>
            {canAdmin(user) && (
              <button
                onClick={() => navigate(adminPath())}
                className="ml-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface2 sm:text-base"
              >
                <Settings className="h-5 w-5" />
                관리자 모드
              </button>
            )}
            <IconBtn onClick={handleLogout} label="로그아웃">
              <LogOut className="h-6 w-6" />
            </IconBtn>
          </div>
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 px-2 pb-1">
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-t-xl px-3 py-3 text-center text-base font-bold transition-colors sm:text-lg",
                  isActive ? "bg-bg text-brand border-b-[3px] border-brand" : "text-ink-faint hover:text-ink-soft"
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
  children: ReactNode;
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
