import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { MonitorHeader } from "@/components/monitor/MonitorHeader";
import { AlertBanner } from "@/components/monitor/AlertBanner";
import { MonitorStatusCard } from "@/components/monitor/MonitorStatusCard";
import { AdaptiveMonitorLayout } from "@/components/monitor/AdaptiveMonitorLayout";
import { MonitorDetailDrawer } from "@/components/monitor/MonitorDetailDrawer";
import { FloorSummaryStats } from "@/components/monitor/FloorSummaryStats";
import { dashboardService } from "@/services/dashboardService";
import { useRealtimeSpaceStatus } from "@/hooks/useRealtimeSpaceStatus";
import { useTTSAlerts, buildTTSAlerts } from "@/hooks/useTTSAlerts";
import { useMonitorStore } from "@/stores/monitorStore";
import { useMonitorSettingsStore } from "@/stores/monitorSettingsStore";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import {
  ACCESS_DENIED_PATH,
  dashboardAdminPath,
  dashboardStaffPath,
  monitorFloorPath,
  monitorHomePath,
} from "@/lib/routeAccess";
import type { Facility, Floor, Space, SpaceStatus } from "@/types";

function gridCols(n: number): string {
  if (n <= 2) return "grid-cols-1 lg:grid-cols-2";
  if (n <= 4) return "grid-cols-1 lg:grid-cols-2";
  if (n <= 6) return "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3";
  // 14공간 등 다수: 55인치 TV 기준 최대 5열
  return "grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5";
}
const densityFor = (n: number): "comfortable" | "compact" => (n > 6 ? "compact" : "comfortable");

export function FloorMonitorPage({ allView = false }: { allView?: boolean }) {
  const navigate = useNavigate();
  const { facilityId: routeFacilityId, floorId } = useParams();
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = routeFacilityId ?? currentFacilityId ?? user?.facilityId;

  const nightMode = useMonitorSettingsStore((s) => s.nightMode);
  const visibleSpaceIds = useMonitorSettingsStore((s) => s.visibleSpaceIds);
  const soundEnabled = useMonitorStore((s) => s.soundEnabled);
  const setSound = useMonitorStore((s) => s.setSound);

  const [facility, setFacility] = useState<Facility | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [allSpaces, setAllSpaces] = useState<Space[]>([]);
  const [selected, setSelected] = useState<Space | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const acknowledge = useMonitorStore((s) => s.acknowledge);
  const effectiveFacilityId = facilityId ?? "";
  const exitPath =
    facilityId && (user?.role === "SUPER_ADMIN" || user?.role === "ADMIN")
      ? dashboardAdminPath(facilityId)
      : facilityId
        ? dashboardStaffPath(facilityId)
        : ACCESS_DENIED_PATH;

  useEffect(() => {
    if (!facilityId) return;
    dashboardService.getDashboard(facilityId).then((d) => {
      setFacility(d.facility);
      setFloors(d.floors);
      setAllSpaces(d.spaces);
    });
  }, [facilityId]);

  // 표시 대상 공간
  const shownSpaces = useMemo(() => {
    let list = allSpaces.filter((s) => s.isActive);
    if (!allView) list = list.filter((s) => s.floorId === floorId);
    if (visibleSpaceIds) list = list.filter((s) => visibleSpaceIds.includes(s.id));
    return list;
  }, [allSpaces, allView, floorId, visibleSpaceIds]);

  const { statuses, sortedSpaces, summary, totalPeople, connection, lastUpdateAt } =
    useRealtimeSpaceStatus(effectiveFacilityId, shownSpaces);

  // TTS 음성 안내 — 주의/위험/응급 공간을 음성으로 안내 (켜진 경우에만)
  const ttsAlerts = useMemo(
    () => buildTTSAlerts(shownSpaces, statuses, floors),
    [shownSpaces, statuses, floors]
  );
  useTTSAlerts(ttsAlerts, soundEnabled);

  const floorName = allView
    ? "전체 층"
    : floors.find((f) => f.id === floorId)?.name ?? "";
  const floorTitle = allView ? "전체 층" : `${floorName} ${floorLabel(floorId, allSpaces)}`;

  const floorOf = (id: string) => floors.find((f) => f.id === id);

  if (!facilityId) return <Navigate to={ACCESS_DENIED_PATH} replace />;

  if (!facility) {
    return <div className="flex min-h-screen items-center justify-center bg-bg text-xl text-ink-soft">현황판을 준비하는 중...</div>;
  }

  return (
    <div ref={rootRef} className={nightMode ? "dark" : ""}>
      <div className="min-h-screen bg-bg p-5 2xl:p-8">
        <MonitorHeader
          facilityName={facility.name}
          floorTitle={floorTitle}
          summary={summary}
          totalPeople={totalPeople}
          connection={connection}
          lastUpdateAt={lastUpdateAt}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSound(!soundEnabled)}
          fullscreenRef={rootRef}
          floorSelectorPath={allView ? undefined : monitorHomePath(facilityId)}
          floorSelectorLabel="전체 보기"
          exitPath={exitPath}
        />

        <div className="mt-4 space-y-4">
          <AlertBanner spaces={shownSpaces} statuses={statuses} />

          {allView ? (
            // 전체 보기: 층별 섹션
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card">
                <span className="mr-1 text-base font-bold text-ink-soft">층 바로가기</span>
                {floors.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => navigate(monitorFloorPath(facilityId, f.id))}
                    className="rounded-xl border border-border px-3 py-2 text-base font-bold text-ink hover:border-brand hover:text-brand"
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              {floors.map((f) => {
                const fs = sortedSpaces.filter((s) => s.floorId === f.id);
                if (fs.length === 0) return null;
                return (
                  <section key={f.id}>
                    <div className="mb-2 flex flex-wrap items-baseline gap-3">
                      <h2 className="text-2xl font-extrabold text-ink 2xl:text-3xl">{f.name}</h2>
                      <FloorSummaryStats summary={sectionSummary(fs, statuses)} className="text-lg 2xl:text-xl" />
                      <button
                        type="button"
                        onClick={() => navigate(monitorFloorPath(facilityId, f.id))}
                        className="ml-auto rounded-xl border border-border px-3 py-1.5 text-sm font-bold text-ink-soft hover:border-brand hover:text-brand"
                      >
                        이 층만 보기
                      </button>
                    </div>
                    <div className={`grid gap-3 ${gridCols(fs.length)}`}>
                      {fs.map((space) => (
                        <MonitorStatusCard
                          key={space.id}
                          space={space}
                          status={statuses[space.id]}
                          density={densityFor(fs.length)}
                          onClick={() => setSelected(space)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            // 단일 층: 적응형 레이아웃(평상시 압축 → 주의/위험/응급 확대)
            <AdaptiveMonitorLayout
              spaces={sortedSpaces}
              statuses={statuses}
              floorOf={floorOf}
              onSelect={setSelected}
              onAck={acknowledge}
            />
          )}

          {sortedSpaces.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-border py-20 text-center text-2xl text-ink-soft">
              표시할 공간이 없습니다.
            </div>
          )}
        </div>

        {selected && (
          <MonitorDetailDrawer
            space={selected}
            floor={floorOf(selected.floorId)}
            status={statuses[selected.id]}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

function floorLabel(floorId: string | undefined, spaces: Space[]): string {
  const list = spaces.filter((s) => s.floorId === floorId);
  const hasRoom = list.some((s) => s.type === "ROOM");
  if (hasRoom) return "생활실";
  const hasProgram = list.some((s) => s.type === "PROGRAM_ROOM" || s.type === "REHAB_ROOM");
  if (hasProgram) return "재활/프로그램";
  return "";
}

function sectionSummary(spaces: Space[], statuses: Record<string, SpaceStatus>) {
  const list = spaces.map((s) => statuses[s.id]).filter(Boolean) as SpaceStatus[];
  return {
    totalSpaces: list.length,
    stable: list.filter((s) => s.status === "STABLE").length,
    caution: list.filter((s) => s.status === "CAUTION").length,
    danger: list.filter((s) => s.status === "DANGER").length,
    checkNeeded: list.filter((s) => s.status === "CHECK_NEEDED").length,
    unacknowledged: 0,
  };
}
