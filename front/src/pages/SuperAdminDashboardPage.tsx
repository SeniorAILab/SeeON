import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, MonitorPlay } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Button, Card } from "@/components/ui/primitives";
import { adminPath, dashboardPath } from "@/lib/routeAccess";
import { listFacilities } from "@/services/api/dashboardEndpoints";
import { apiErrorMessage } from "@/services/apiClient";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import type { Facility } from "@/types";

function duplicateFacilityNames(facilities: Facility[]) {
  const nameCounts = new Map<string, number>();
  for (const facility of facilities) {
    nameCounts.set(facility.name, (nameCounts.get(facility.name) ?? 0) + 1);
  }
  return new Set([...nameCounts].filter(([, count]) => count > 1).map(([name]) => name));
}

export function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const switchFacility = useFacilityStore((s) => s.switchFacility);
  const setFacilitiesStore = useFacilityStore((s) => s.setFacilities);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadFacilities() {
      setLoading(true);
      setError(null);
      try {
        const nextFacilities = await listFacilities();
        if (!active) return;
        setFacilities(nextFacilities);
        setFacilitiesStore(nextFacilities);
      } catch (caught) {
        if (!active) return;
        setError(apiErrorMessage(caught, "시설 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."));
        setFacilities([]);
        setFacilitiesStore([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadFacilities();
    return () => {
      active = false;
    };
  }, [setFacilitiesStore]);

  async function handleLogout() {
    switchFacility(null);
    await logout();
    navigate("/login");
  }

  function enterFacility(facilityId: string, path: string) {
    switchFacility(facilityId);
    navigate(path);
  }
  const duplicatedFacilityNames = duplicateFacilityNames(facilities);

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <LogoMark size={36} />
          <div className="shrink-0">
            <h1 className="whitespace-nowrap text-lg font-bold text-ink">Senior AI Lab</h1>
            <p className="whitespace-nowrap text-xs text-ink-soft">전역 개요</p>
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
            <h2 className="mt-1 break-keep text-2xl font-extrabold text-ink">요양원 전역 개요</h2>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 text-center md:w-auto">
            <Metric label="요양원" value={facilities.length} />
          </div>
        </div>

        {loading ? (
          <Card className="p-5">
            <div className="text-sm font-semibold text-ink">시설 목록을 불러오는 중...</div>
            <div className="mt-1 text-sm text-ink-soft">등록된 요양원 정보를 확인하고 있습니다.</div>
          </Card>
        ) : error ? (
          <Card className="border-status-danger bg-status-dangerBg p-5">
            <div className="text-sm font-bold text-status-danger">시설 목록 연결 실패</div>
            <div className="mt-1 break-all text-sm text-ink-soft">{error}</div>
          </Card>
        ) : facilities.length === 0 ? (
          <Card className="p-5">
            <div className="text-sm font-semibold text-ink">등록된 요양원이 없습니다.</div>
            <div className="mt-1 text-sm text-ink-soft">백엔드 시설 등록 상태를 확인하세요.</div>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {facilities.map((facility) => (
              <Card key={facility.id} className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h3 className="break-keep text-lg font-bold text-ink">{facility.name}</h3>
                    {(facility.address ?? "").trim() ? (
                      <p className="mt-1 text-sm text-ink-soft">{facility.address}</p>
                    ) : duplicatedFacilityNames.has(facility.name) ? (
                      <p className="mt-1 text-sm text-ink-soft">시설 ID: {facility.id.slice(-6)}</p>
                    ) : null}
                    <p className="mt-0.5 text-sm text-ink-soft">{facility.phone}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => enterFacility(facility.id, dashboardPath(facility.id))}>
                    <MonitorPlay className="h-4 w-4" />
                    대시보드
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => enterFacility(facility.id, adminPath(facility.id))}>
                    <LayoutDashboard className="h-4 w-4" />
                    관리자 화면
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2">
      <div className="text-xl font-extrabold text-ink">{value}</div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}
