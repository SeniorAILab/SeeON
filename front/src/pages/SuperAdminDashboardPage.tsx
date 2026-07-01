import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  Smartphone,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Button, Card } from "@/components/ui/primitives";
import {
  dashboardAdminPath,
  dashboardStaffPath,
  monitorHomePath,
} from "@/lib/routeAccess";
import { dashboardService } from "@/services/dashboardService";
import { useAuthStore } from "@/store/authStore";
import { facilitiesForUser, useFacilityStore } from "@/store/facilityStore";

type FacilityReadModel = {
  facilityId: string;
  floors: number;
  spaces: number;
  unacknowledged: number;
  status: "ready" | "unavailable";
};

export function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setFacility = useFacilityStore((s) => s.setFacility);
  const facilities = useMemo(() => facilitiesForUser(null), []);
  const [readModels, setReadModels] = useState<Record<string, FacilityReadModel>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      facilities.map(async (facility) => {
        try {
          const dashboard = await dashboardService.getDashboard(facility.id);
          const isScopedToFacility = dashboard.facility.id === facility.id;
          if (!isScopedToFacility) {
            return {
              facilityId: facility.id,
              floors: 0,
              spaces: 0,
              unacknowledged: 0,
              status: "unavailable" as const,
            };
          }
          return {
            facilityId: facility.id,
            floors: dashboard.floors.length,
            spaces: dashboard.spaces.length,
            unacknowledged: dashboard.unacknowledgedEvents.length,
            status: "ready" as const,
          };
        } catch {
          return {
            facilityId: facility.id,
            floors: 0,
            spaces: 0,
            unacknowledged: 0,
            status: "unavailable" as const,
          };
        }
      })
    ).then((items) => {
      if (cancelled) return;
      setReadModels(Object.fromEntries(items.map((item) => [item.facilityId, item])));
    });
    return () => {
      cancelled = true;
    };
  }, [facilities]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function enterFacility(facilityId: string, path: string) {
    setFacility(facilityId);
    navigate(path);
  }

  const availableReadModels = Object.values(readModels).filter((item) => item.status === "ready");

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <LogoMark size={36} />
          <div className="shrink-0">
            <h1 className="whitespace-nowrap text-lg font-bold text-ink">Senior AI Lab</h1>
            <p className="whitespace-nowrap text-xs text-ink-soft">통합 관리자 대시보드</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-ink-soft md:inline">{user?.email}</span>
            <Button type="button" variant="secondary" size="sm" onClick={handleLogout} className="shrink-0">
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-brand">
              <LayoutDashboard className="h-4 w-4" />
              시스템 전체
            </div>
            <h2 className="mt-1 break-keep text-2xl font-extrabold text-ink">요양원을 선택하세요</h2>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 text-center md:w-auto">
            <Metric label="요양원" value={facilities.length} />
            <Metric
              label="공간"
              value={availableReadModels.reduce((sum, item) => sum + item.spaces, 0)}
            />
            <Metric
              label="미확인"
              value={availableReadModels.reduce((sum, item) => sum + item.unacknowledged, 0)}
            />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {facilities.map((facility) => {
            const readModel = readModels[facility.id];
            const unavailable = readModel?.status === "unavailable";
            return (
              <Card key={facility.id} className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">
                      <Building2 className="h-3.5 w-3.5" />
                      {facility.code}
                    </div>
                    <h3 className="break-keep text-lg font-bold text-ink">{facility.name}</h3>
                    <p className="mt-1 text-sm text-ink-soft">{facility.address}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">{facility.phone}</p>
                  </div>
                  <div className="grid w-full grid-cols-3 gap-2 text-center md:w-[180px]">
                    <Metric label="층" value={unavailable ? null : readModel?.floors ?? 0} compact />
                    <Metric label="공간" value={unavailable ? null : readModel?.spaces ?? 0} compact />
                    <Metric label="알림" value={unavailable ? null : readModel?.unacknowledged ?? 0} compact />
                  </div>
                </div>

                {unavailable && (
                  <div className="mt-3 rounded-lg border border-status-caution/30 bg-status-cautionBg px-3 py-2 text-sm font-semibold text-ink-soft">
                    대시보드 연결 실패
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      enterFacility(facility.id, dashboardAdminPath(facility.id))
                    }
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    관리자 화면
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      enterFacility(facility.id, dashboardStaffPath(facility.id))
                    }
                  >
                    <Smartphone className="h-4 w-4" />
                    직원 화면
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => enterFacility(facility.id, monitorHomePath(facility.id))}
                  >
                    <MonitorPlay className="h-4 w-4" />
                    모니터
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number | null;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "rounded-md bg-surface2 px-2 py-1.5" : "rounded-lg bg-surface px-3 py-2"}>
      <div className={compact ? "text-base font-extrabold text-ink" : "text-xl font-extrabold text-ink"}>
        {value ?? "-"}
      </div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}
