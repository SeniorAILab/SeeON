import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  LogOut,
  Building2,
  DoorOpen,
  Users as UsersIcon,
  Menu,
  X,
  LayoutGrid,
  MonitorPlay,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import { canAdmin, roleLabel } from "@/lib/roles";
import { useFacilityStore, facilitiesForUser } from "@/store/facilityStore";
import { listFacilities } from "@/services/api/dashboardEndpoints";
import { FACILITIES_PICKER_PATH, adminPath, dashboardPath } from "@/lib/routeAccess";

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const userFacilityId = user?.facilityId ?? null;
  const userId = user?.id;
  const userRole = user?.role;

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilities = useFacilityStore((s) => s.facilities);
  const switchFacility = useFacilityStore((s) => s.switchFacility);
  const setFacilities = useFacilityStore((s) => s.setFacilities);

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
  const currentFacility = myFacilities.find((f) => f.id === activeFacilityId) ?? null;
  const facilityLabel = currentFacility?.name ?? activeFacilityId ?? "전역 개요";

  async function handleLogout() {
    switchFacility(null);
    await logout();
    navigate("/login");
  }

  function handleFacilityChange(next: string) {
    if (next === "__global__") {
      switchFacility(null);
      navigate(FACILITIES_PICKER_PATH);
      return;
    }
    switchFacility(next);
    navigate(adminPath(next));
  }

  const routeFacilityId = activeFacilityId ?? "";
  const nav = [
    { to: routeFacilityId ? adminPath(routeFacilityId) : FACILITIES_PICKER_PATH, label: "상세 대시보드", Icon: LayoutGrid, show: true },
    { to: routeFacilityId ? adminPath(routeFacilityId, "events") : FACILITIES_PICKER_PATH, label: "이벤트", Icon: Bell, show: true },
    { to: routeFacilityId ? adminPath(routeFacilityId, "monitor-settings") : FACILITIES_PICKER_PATH, label: "모니터 설정", Icon: MonitorPlay, show: canAdmin(user) },
    { to: routeFacilityId ? adminPath(routeFacilityId, "facility") : FACILITIES_PICKER_PATH, label: "시설 설정", Icon: Building2, show: canAdmin(user) },
    { to: routeFacilityId ? adminPath(routeFacilityId, "spaces") : FACILITIES_PICKER_PATH, label: "공간 관리", Icon: DoorOpen, show: canAdmin(user) },
    { to: routeFacilityId ? adminPath(routeFacilityId, "users") : FACILITIES_PICKER_PATH, label: "사용자", Icon: UsersIcon, show: canAdmin(user) },
    // Re-enable after backend controllers exist: 관심 어르신, 구역/침대 배정, 알림 규칙.
  ].filter((n) => n.show);

  return (
    <div className="flex min-h-screen bg-bg">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <LogoMark size={32} />
          <div className="leading-tight">
            <div className="text-sm font-bold text-ink">Senior AI Lab</div>
            <div className="text-[11px] text-ink-soft">관리자</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-gray-100"
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink">
            <div className="truncate">{facilityLabel}</div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-gray-100"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-2 border-b border-border bg-surface/80 px-4 py-2 backdrop-blur lg:flex-nowrap lg:gap-3 lg:px-6">
          <button
            className="rounded-lg p-1.5 text-ink-soft hover:bg-gray-100 lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="min-w-0 flex-1 lg:flex-none">
            {userRole === "SUPER_ADMIN" ? (
              <label className="flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                <Building2 className="h-4 w-4 text-gray-400" />
                <select
                  aria-label="시설 전환"
                  className="min-w-0 max-w-full truncate bg-transparent text-sm font-semibold text-ink focus:outline-none"
                  value={activeFacilityId ?? "__global__"}
                  onChange={(e) => handleFacilityChange(e.target.value)}
                >
                  <option value="__global__">전역 개요</option>
                  {myFacilities.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Building2 className="h-4 w-4 text-gray-400" />
                {facilityLabel}
              </div>
            )}
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto lg:flex-nowrap lg:gap-3">
            <div className="hidden text-sm font-semibold text-ink-soft md:block">
              {user ? roleLabel(user.role) : ""}
            </div>
            <button
              onClick={() => navigate(routeFacilityId ? dashboardPath(routeFacilityId) : FACILITIES_PICKER_PATH)}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-gray-50"
            >
              <MonitorPlay className="h-4 w-4" />
              대시보드
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
