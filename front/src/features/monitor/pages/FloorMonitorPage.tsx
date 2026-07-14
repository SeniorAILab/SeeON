import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { MonitorHeader } from "@/features/monitor/components/MonitorHeader";

import { RoomStatusBoard } from "@/components/status/RoomStatusBoard";
import { dashboardService } from "@/services/dashboardService";
import { useRealtimeSpaceStatus } from "@/features/monitor/hooks/useRealtimeSpaceStatus";
import { useTTSAlerts, buildTTSAlerts } from "@/features/monitor/hooks/useTTSAlerts";
import { useMonitorStore } from "@/stores/monitorStore";
import { useMonitorSettingsStore } from "@/features/monitor/stores/monitorSettingsStore";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import { ACCESS_DENIED_PATH, floorPath } from "@/lib/routeAccess";
import type { Facility, Floor, Space } from "@/types";



export function FloorMonitorPage({ allView = false }: { allView?: boolean }) {

  const { floorId } = useParams();
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = user?.role === "SUPER_ADMIN" ? currentFacilityId : user?.facilityId;

  const nightMode = useMonitorSettingsStore((s) => s.nightMode);
  const visibleSpaceIds = useMonitorSettingsStore((s) => s.visibleSpaceIds);
  const alertSound = useMonitorSettingsStore((s) => s.alertSound);
  const cardSize = useMonitorSettingsStore((s) => s.cardSize);
  const allowAllView = useMonitorSettingsStore((s) => s.allowAllView);
  const defaultFloorId = useMonitorSettingsStore((s) => s.defaultFloorId);
  const updateSettings = useMonitorSettingsStore((s) => s.update);

  const [facility, setFacility] = useState<Facility | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [allSpaces, setAllSpaces] = useState<Space[]>([]);
  const [selected, setSelected] = useState<Space | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);
  const reload = useMonitorStore((s) => s.reload);
  const dashboard = useMonitorStore((s) => s.dashboard);
  const effectiveFacilityId = facilityId ?? "";

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
  useTTSAlerts(ttsAlerts, alertSound);
  const alertsBySpace = useMemo(() => {
    const groups: Record<string, NonNullable<typeof dashboard>["unacknowledgedEvents"]> = {};
    for (const alert of dashboard?.unacknowledgedEvents ?? []) groups[alert.spaceId] = [...(groups[alert.spaceId] ?? []), alert];
    return groups;
  }, [dashboard?.unacknowledgedEvents]);


  const floorName = allView
    ? "전체 층"
    : floors.find((f) => f.id === floorId)?.name ?? "";
  const floorTitle = allView ? "전체 층" : `${floorName} ${floorLabel(floorId, allSpaces)}`;


  if (!facilityId) return <Navigate to={ACCESS_DENIED_PATH} replace />;
  if (allView && !allowAllView && defaultFloorId !== "all") {
    return <Navigate to={floorPath(facilityId, defaultFloorId)} replace />;
  }

  if (!facility) {
    return <div className="flex min-h-screen items-center justify-center bg-bg text-xl text-ink-soft">현황판을 준비하는 중...</div>;
  }

  return (
    <div ref={rootRef} className={nightMode ? "dark" : ""}>
      <div
        style={{ height: isFullscreen ? "100dvh" : "calc(100dvh - 11rem)" }}
        className="relative left-1/2 flex w-screen -translate-x-1/2 flex-col overflow-hidden bg-bg p-5 2xl:p-8"
      >
        <MonitorHeader
          facilityName={facility.name}
          floorTitle={floorTitle}
          summary={summary}
          totalPeople={totalPeople}
          connection={connection}
          lastUpdateAt={lastUpdateAt}
          soundEnabled={alertSound}
          onToggleSound={() => updateSettings({ alertSound: !alertSound })}
          onRefresh={() => void reload()}
          fullscreenRef={rootRef}
          floors={allowAllView ? floors : []}
          currentFloorId={allView ? null : (floorId ?? null)}
          facilityId={facilityId}
        />

        <div className="mt-4 flex min-h-0 flex-1">
          <RoomStatusBoard
            spaces={sortedSpaces}
            statuses={statuses}
            floors={floors}
            alertsBySpace={alertsBySpace}
            connection={connection}
            lastUpdateAt={lastUpdateAt}
            variant="staff"
            layout={allView ? "overview" : "focus"}
            cardSize={cardSize}
            selectedSpace={selected}
            onSelectSpace={setSelected}
            onClosePanel={() => setSelected(null)}
            onResolved={() => void reload()}
          />
        </div>


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

