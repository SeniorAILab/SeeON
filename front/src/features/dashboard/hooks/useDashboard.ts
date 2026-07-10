import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";
import { useMonitorStore } from "@/stores/monitorStore";

/** 대시보드 데이터 로딩 + 단일 모니터 스토어 구독 (직원/관리자 화면 공용) */
export function useDashboard(pollMs = 20_000) {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = currentFacilityId ?? user?.facilityId ?? null;
  const data = useMonitorStore((s) => s.dashboard);
  const loading = useMonitorStore((s) => s.loading);
  const start = useMonitorStore((s) => s.start);
  const reload = useMonitorStore((s) => s.reload);

  useEffect(() => {
    if (!facilityId) {
      useMonitorStore.setState({ dashboard: null, loading: false, statuses: {} });
      return;
    }
    start(facilityId, pollMs);
  }, [facilityId, pollMs, start]);

  return { data, loading, reload };
}
