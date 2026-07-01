import { useCallback, useEffect, useState } from "react";
import { buildSseUrl, isAbsoluteApiUrl, USE_MOCK } from "@/services/apiClient";
import { dashboardService } from "@/services/dashboardService";
import { mapAlertDto } from "@/services/api/alertEndpoints";
import { mergeAlertsIntoDashboard } from "@/services/alertMerge";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import type { DashboardResponse } from "@/types";

/** 대시보드 데이터 로딩 + 주기적 갱신 (직원/관리자 화면 공용) */
export function useDashboard(pollMs = 20_000) {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = currentFacilityId ?? user?.facilityId ?? null;

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!facilityId) {
      setData(null);
      setLoading(false);
      return;
    }
    const res = await dashboardService.getDashboard(facilityId);
    setData(res);
    setLoading(false);
  }, [facilityId]);

  const handleSessionInvalid = useCallback(() => {
    useAuthStore.getState().logout().catch(() => {
      useAuthStore.setState({ user: null });
    });
  }, []);


  useEffect(() => {
    setLoading(true);
    reload();
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);

  useEffect(() => {
    if (USE_MOCK || typeof EventSource === "undefined") return;

    const url = buildSseUrl();
    const eventSource = isAbsoluteApiUrl(url)
      ? new EventSource(url, { withCredentials: true })
      : new EventSource(url);

    const mergeAlertMessage = (event: MessageEvent) => {
      try {
        const alert = mapAlertDto(JSON.parse(event.data));
        setData((current) => (current ? mergeAlertsIntoDashboard(current, [alert]) : current));
      } catch {
        reload();
      }
    };

    eventSource.onmessage = mergeAlertMessage;
    eventSource.addEventListener("alert", (event) => mergeAlertMessage(event as MessageEvent));
    eventSource.addEventListener("status", reload);
    eventSource.addEventListener("status-snapshot", reload);
    eventSource.addEventListener("alert-updated", reload);
    eventSource.addEventListener("session-invalid", () => {
      eventSource.close();
      handleSessionInvalid();
    });
    eventSource.onerror = () => {
      // EventSource reconnects automatically; polling remains as fallback.
    };

    return () => eventSource.close();
  }, [handleSessionInvalid, reload]);

  return { data, loading, reload };
}
