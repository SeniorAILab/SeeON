import { useCallback, useEffect, useState } from "react";
import { dashboardService } from "@/services/dashboardService";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import type { DashboardResponse } from "@/types";

/** 대시보드 데이터 로딩 + 주기적 갱신 (직원/관리자 화면 공용) */
export function useDashboard(pollMs = 20_000) {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = currentFacilityId ?? user?.facilityId ?? "fac_happy_nokyang";

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const res = await dashboardService.getDashboard(facilityId);
    setData(res);
    setLoading(false);
  }, [facilityId]);

  useEffect(() => {
    setLoading(true);
    reload();
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);

  return { data, loading, reload };
}
