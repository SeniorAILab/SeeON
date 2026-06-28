import { useEffect, useMemo } from "react";
import { USE_MOCK } from "@/services/apiClient";
import { realtimeEngine } from "@/mocks/realtimeEngine";
import { useMonitorStore } from "@/stores/monitorStore";
import { useMonitorSettingsStore } from "@/stores/monitorSettingsStore";
import { attentionRank } from "@/lib/staffCopy";
import type { DashboardSummary, Space, SpaceStatus } from "@/types";

/**
 * 모니터용 실시간 상태 구독 훅.
 * 엔진을 시작하고, 주어진 공간 목록에 대해 라이브 상태/요약을 반환한다.
 */
export function useRealtimeSpaceStatus(facilityId: string, spaces: Space[]) {
  const start = useMonitorStore((s) => s.start);
  const statuses = useMonitorStore((s) => s.statuses);
  const connection = useMonitorStore((s) => s.connection);
  const lastUpdateAt = useMonitorStore((s) => s.lastUpdateAt);
  const refreshMs = useMonitorSettingsStore((s) => s.refreshMs);
  const demoMode = useMonitorSettingsStore((s) => s.demoMode);

  useEffect(() => {
    if (facilityId) start(facilityId, refreshMs);
  }, [facilityId, refreshMs, start]);

  // 데모 모드/갱신 간격 변경을 엔진에 반영
  useEffect(() => {
    if (USE_MOCK) realtimeEngine.setDemoMode(demoMode);
  }, [demoMode]);
  useEffect(() => {
    if (USE_MOCK) realtimeEngine.setInterval(refreshMs);
  }, [refreshMs]);

  const sortedSpaces = useMemo(
    () =>
      [...spaces].sort(
        (a, b) =>
          attentionRank[statuses[a.id]?.status ?? "STABLE"] -
          attentionRank[statuses[b.id]?.status ?? "STABLE"]
      ),
    [spaces, statuses]
  );

  const { summary, totalPeople } = useMemo(() => {
    const list = spaces.map((s) => statuses[s.id]).filter(Boolean) as SpaceStatus[];
    const sum: DashboardSummary = {
      totalSpaces: list.length,
      stable: list.filter((s) => s.status === "STABLE").length,
      caution: list.filter((s) => s.status === "CAUTION").length,
      danger: list.filter((s) => s.status === "DANGER").length,
      checkNeeded: list.filter((s) => s.status === "CHECK_NEEDED").length,
      unacknowledged: list.filter(
        (s) => s.kakaoAlertStatus === "PENDING" || s.kakaoAlertStatus === "SENT"
      ).length,
    };
    return { summary: sum, totalPeople: list.reduce((a, s) => a + s.peopleCount, 0) };
  }, [spaces, statuses]);

  return { statuses, sortedSpaces, summary, totalPeople, connection, lastUpdateAt };
}
