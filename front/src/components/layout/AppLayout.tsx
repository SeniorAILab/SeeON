import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  LogOut,
  Building2,
  Layers,
  DoorOpen,
  BedDouble,
  ShieldAlert,
  Users as UsersIcon,
  ChevronDown,
  Menu,
  X,
  Smartphone,
  LayoutGrid,
  MonitorPlay,
  Heart,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import { canAdmin, roleLabel } from "@/lib/roles";
import { useFacilityStore, facilitiesForUser } from "@/store/facilityStore";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const now = useClock();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 관리자 화면은 항상 밝게(라이트) 표시 — 다크모드는 직원 야간 화면 전용
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const setFacility = useFacilityStore((s) => s.setFacility);
  const myFacilities = facilitiesForUser(user?.facilityId ?? null);
  const currentFacility =
    myFacilities.find((f) => f.id === currentFacilityId) ?? myFacilities[0];

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const nav = [
    { to: "/admin/dashboard", label: "상세 대시보드", Icon: LayoutGrid, show: true },
    { to: "/admin/events", label: "이벤트", Icon: Bell, show: true },
    { to: "/admin/focus-residents", label: "관심 어르신", Icon: Heart, show: true },
    { to: "/admin/monitor-settings", label: "모니터 설정", Icon: MonitorPlay, show: canAdmin(user) },
    { to: "/admin/ux-test", label: "UX 테스트 결과", Icon: FlaskConical, show: true },
    { to: "/admin/facility", label: "시설 설정", Icon: Building2, show: canAdmin(user) },
    { to: "/admin/floors", label: "층 관리", Icon: Layers, show: canAdmin(user) },
    { to: "/admin/spaces", label: "공간 관리", Icon: DoorOpen, show: canAdmin(user) },
    { to: "/admin/assignments", label: "구역/침대 배정", Icon: BedDouble, show: canAdmin(user) },
    { to: "/admin/alert-rules", label: "알림 규칙", Icon: ShieldAlert, show: canAdmin(user) },
    { to: "/admin/users", label: "사용자", Icon: UsersIcon, show: canAdmin(user) },
  ].filter((n) => n.show);

  return (
    <div className="flex min-h-screen bg-bg">
      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 사이드바 */}
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
            <div className="text-[11px] text-gray-400">관리자</div>
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
                  isActive
                    ? "bg-brand-soft text-brand"
                    : "text-ink-soft hover:bg-gray-100"
                )
              }
            >
              <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-ink-soft">
              {user?.name.slice(0, 1)}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium text-ink">{user?.name}</div>
              <div className="text-[11px] text-gray-400">
                {user ? roleLabel(user.role) : ""}
              </div>
            </div>
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

      {/* 메인 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur lg:px-6">
          <button
            className="rounded-lg p-1.5 text-ink-soft hover:bg-gray-100 lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* 시설 선택 (SUPER_ADMIN 은 전환 가능) */}
          <div className="relative">
            {myFacilities.length > 1 ? (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                <Building2 className="h-4 w-4 text-gray-400" />
                <select
                  className="bg-transparent text-sm font-semibold text-ink focus:outline-none"
                  value={currentFacility?.id}
                  onChange={(e) => setFacility(e.target.value)}
                >
                  {myFacilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Building2 className="h-4 w-4 text-gray-400" />
                {currentFacility?.name}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => navigate("/now")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-gray-50"
            >
              <Smartphone className="h-4 w-4" />
              직원 모드로
            </button>
            <div className="hidden text-sm tabular-nums text-ink-soft sm:block">
              {now.getFullYear()}.{String(now.getMonth() + 1).padStart(2, "0")}.
              {String(now.getDate()).padStart(2, "0")}{" "}
              {String(now.getHours()).padStart(2, "0")}:
              {String(now.getMinutes()).padStart(2, "0")}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
