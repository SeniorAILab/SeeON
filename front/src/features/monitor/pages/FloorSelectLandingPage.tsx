import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FloorSelectCard } from "@/features/monitor/components/FloorSelectCard";
import { groupRoomsByFloor, type RoomFloorGroup } from "@/components/status/RoomStatusTreemap";
import { ACCESS_DENIED_PATH, dashboardPath, floorPath } from "@/lib/routeAccess";
import { dashboardService } from "@/services/dashboardService";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import type { DashboardResponse } from "@/types";

export function FloorSelectLandingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = user?.role === "SUPER_ADMIN" ? currentFacilityId : user?.facilityId;

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!facilityId) return;

    let cancelled = false;
    setLoading(true);
    setError(false);
    dashboardService
      .getDashboard(facilityId)
      .then((nextDashboard) => {
        if (!cancelled) setDashboard(nextDashboard);
      })
      .catch(() => {
        if (!cancelled) {
          setDashboard(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [facilityId, reloadKey]);

  const groups = useMemo(() => {
    if (!dashboard) return [];
    return groupRoomsByFloor(dashboard.spaces, dashboard.statuses, dashboard.floors);
  }, [dashboard]);
  const floorGroups = useMemo(
    (): Array<RoomFloorGroup & { floor: NonNullable<RoomFloorGroup["floor"]> }> =>
      groups.filter(
        (group): group is RoomFloorGroup & { floor: NonNullable<RoomFloorGroup["floor"]> } =>
          group.floor !== null,
      ),
    [groups],
  );

  const totalAlertCount = useMemo(
    () => floorGroups.reduce((sum, group) => sum + group.alertCount, 0),
    [floorGroups],
  );

  if (!facilityId) return <Navigate to={ACCESS_DENIED_PATH} replace />;

  if (error) {
    return (
      <div className="relative left-1/2 flex min-h-[calc(100dvh-9.5rem)] w-screen -translate-x-1/2 flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-staff-body font-bold text-status-danger">층 정보를 불러오지 못했습니다.</p>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="min-h-12 rounded-2xl border border-border px-6 text-staff-btn font-black text-ink hover:bg-surface2"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (loading || !dashboard) {
    return <div className="relative left-1/2 flex min-h-[calc(100dvh-9.5rem)] w-screen -translate-x-1/2 items-center justify-center px-4 text-xl font-bold text-ink-soft">층 선택 화면을 준비하는 중...</div>;
  }

  return (
    <section className="relative left-1/2 flex min-h-[calc(100dvh-9.5rem)] w-screen -translate-x-1/2 flex-col gap-4 px-4 pb-4" aria-labelledby="floor-select-title">
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm 2xl:p-6">
        <p className="text-staff-body font-bold text-ink-soft">{dashboard.facility.name}</p>
        <h1 id="floor-select-title" className="mt-2 text-staff-name font-black text-ink">
          층 선택
        </h1>
        <p className="mt-2 text-staff-body font-semibold text-ink-soft">층 집중 화면으로 이동할 층을 선택하세요.</p>
      </div>

      {floorGroups.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-staff-body font-bold text-ink-soft">
          표시할 층이 없습니다.
        </div>
      )}

      <div className="grid min-h-0 flex-1 auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="층 선택 목록">
        {floorGroups.map((group) => (
          <div key={group.floor.id} className="min-h-0" role="listitem">
            <FloorSelectCard
              floorName={group.floorName}
              alertCount={group.alertCount}
              onSelect={() => navigate(floorPath(facilityId, group.floor.id))}
            />
          </div>
        ))}
        <div className="min-h-0" role="listitem">
          <FloorSelectCard
            floorName="전체 보기"
            alertCount={totalAlertCount}
            onSelect={() => navigate(dashboardPath(facilityId))}
          />
        </div>
      </div>
    </section>
  );
}
