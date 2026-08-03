import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, MonitorPlay } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Button, Card } from "@/components/ui/primitives";
import { adminPath, dashboardPath } from "@/lib/routeAccess";
import { listFacilities } from "@/services/api/dashboardEndpoints";
import { buildFreshnessBySpace, listCameras } from "@/services/api/cameras";
import { apiErrorMessage } from "@/services/apiClient";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import type { Facility } from "@/types";

export function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const switchFacility = useFacilityStore((s) => s.switchFacility);
  const setFacilitiesStore = useFacilityStore((s) => s.setFacilities);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 기사님에게 시설 ID를 불러주는 대신 복사해 전달할 수 있게 한다.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /**
   * 카메라 건강상태. 전역 화면이 시설 목록만 보여주면 운영자가 엣지 단절을
   * 고객 전화로 처음 알게 된다. 끊긴 카메라 수를 여기서 먼저 본다.
   */
  const [cameraHealth, setCameraHealth] = useState<{ total: number; stale: number } | null>(
    null,
  );

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

  useEffect(() => {
    let active = true;
    listCameras()
      .then((cameras) => {
        if (!active) return;
        const freshness = Object.values(buildFreshnessBySpace(cameras, Date.now()));
        setCameraHealth({
          total: cameras.length,
          stale: freshness.filter((entry) => entry.connection === "STALE").length,
        });
      })
      .catch(() => {
        // 카메라 조회 실패가 시설 목록 표시를 막지 않는다.
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    switchFacility(null);
    await logout();
    navigate("/login");
  }

  function enterFacility(facilityId: string, path: string) {
    switchFacility(facilityId);
    navigate(path);
  }
  async function copyFacilityId(facilityId: string) {
    try {
      await navigator.clipboard?.writeText(facilityId);
      setCopiedId(facilityId);
      setTimeout(
        () => setCopiedId((current) => (current === facilityId ? null : current)),
        2000,
      );
    } catch {
      // 클립보드 권한이 없어도 ID 자체는 화면에 그대로 보이므로 막지 않는다.
    }
  }

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
          <div className="grid w-full grid-cols-1 gap-2 text-center md:w-auto sm:grid-cols-3">
            <Metric label="요양원" value={facilities.length} />
            {cameraHealth && (
              <>
                <Metric label="카메라" value={cameraHealth.total} />
                <div
                  data-testid="camera-health-stale"
                  className={`rounded-lg px-3 py-2 ${
                    cameraHealth.stale > 0 ? "bg-status-dangerBg" : "bg-surface"
                  }`}
                >
                  <div
                    className={`text-xl font-extrabold ${
                      cameraHealth.stale > 0 ? "text-status-danger" : "text-ink"
                    }`}
                  >
                    {cameraHealth.stale}
                  </div>
                  <div className="text-[11px] text-ink-faint">연결 끊김</div>
                </div>
              </>
            )}
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
                    ) : null}
                    {/* 기사님 현장 인계용. 엣지 연결 설정에 그대로 붙여넣어야 하므로
                        끝 6자리가 아니라 전체 ID를 보여주고 복사까지 제공한다. */}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-sm text-ink-soft">시설 ID</span>
                      <code
                        data-testid={`facility-id-${facility.id}`}
                        className="break-all rounded bg-surface2 px-1.5 py-0.5 font-mono text-sm text-ink"
                      >
                        {facility.id}
                      </code>
                      <button
                        type="button"
                        aria-label={`${facility.name} 시설 ID 복사`}
                        onClick={() => void copyFacilityId(facility.id)}
                        className="rounded-lg border border-border px-2 py-1 text-sm font-semibold text-ink-soft hover:bg-surface2"
                      >
                        {copiedId === facility.id ? "복사됨" : "복사"}
                      </button>
                    </div>
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
