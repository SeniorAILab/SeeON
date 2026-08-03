import { create } from "zustand";
import { fetchActiveAlertSnapshot, mapAlertDto, resolveAlert, type FrontendAlert } from "@/services/api/alertEndpoints";
import { buildSseUrl, isAbsoluteApiUrl } from "@/services/apiClient";
import { buildFreshnessBySpace, listCameras, type SpaceFreshness } from "@/services/api/cameras";
import { dashboardService } from "@/services/dashboardService";
import { recordDashboardDelivery } from "@/services/dashboardReceiptService";
import {
  alertsForFacility,
  createAlertMergeState,
  deriveStatusesFromAlerts,
  isActiveAlert,
  mergeAlertUpdates,
  reconcileActiveAlertSnapshot,
  mergeAlerts,
  type AlertMergeState,
  type AlertUpdateDelta,
} from "@/services/alertMerge";
import { useAuthStore } from "@/stores/authStore";
import { registerFacilityMonitorController, useFacilityStore } from "@/stores/facilityStore";
import type { ConnectionState, DashboardResponse, DashboardSummary, SpaceStatus } from "@/types";

interface MonitorState {
  dashboard: DashboardResponse | null;
  loading: boolean;
  statuses: Record<string, SpaceStatus>;
  connection: ConnectionState;
  lastUpdateAt: string | null;
  running: boolean;
  soundEnabled: boolean;
  start: (facilityId: string, intervalMs?: number) => void;
  reload: () => Promise<void>;
  stop: () => void;
  resolve: (spaceId: string) => Promise<void> | void;
  setSound: (on: boolean) => void;
}

let unsub: (() => void) | null = null;
let alertMergeState: AlertMergeState = createAlertMergeState();
let activeFacilityId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
/**
 * SSE 실시간 채널이 살아 있는지. REST 폴링 성공과 **별개로** 추적한다.
 *
 * 이걸 분리하지 않으면 SSE가 끊긴 뒤에도 6초 REST 폴링이 성공할 때마다
 * connection이 NORMAL로 덮여 장애가 화면에서 사라진다. 실시간 알림이
 * 안 오는데 배지는 정상이라고 말하는 상태가 제일 위험하다.
 */
let sseHealthy = false;
/** spaceId → 카메라 신선도. 카메라 조회 실패 시 직전 값을 유지한다. */
let freshnessBySpace: Record<string, SpaceFreshness> = {};

/** REST 스냅샷 성공만으로는 NORMAL을 주장할 수 없다. SSE가 살아 있어야 한다. */
function connectionAfterRestSuccess(): ConnectionState {
  return sseHealthy ? "NORMAL" : "RECONNECTING";
}

/**
 * 카메라 신선도를 갱신한다. 실패해도 대시보드 갱신을 막지 않되,
 * 직전 신선도를 그대로 두어 "모르는 사이 정상으로 보이는" 상태를 만들지 않는다.
 */
async function refreshCameraFreshness(facilityId: string): Promise<void> {
  try {
    const cameras = await listCameras();
    if (!isActiveFacility(facilityId)) return;
    freshnessBySpace = buildFreshnessBySpace(cameras, Date.now());
  } catch {
    // 유지. 비워버리면 STALE 표시가 사라져 죽은 카메라가 정상으로 읽힌다.
  }
}

/** 알림 기반 status 위에 카메라 신선도를 직교로 덮어씌운다(status는 건드리지 않는다). */
function applyFreshness(statuses: Record<string, SpaceStatus>): Record<string, SpaceStatus> {
  const next: Record<string, SpaceStatus> = {};
  for (const [spaceId, status] of Object.entries(statuses)) {
    const freshness = freshnessBySpace[spaceId];
    next[spaceId] = freshness
      ? { ...status, connection: freshness.connection, lastSeenAt: freshness.lastSeenAt }
      : status;
  }
  return next;
}
function isActiveFacility(facilityId: string): boolean {
  return activeFacilityId === facilityId;
}

// Single funnel for delivery receipts: every alert-arrival path goes through
// here, and alerts from another facility (e.g. a facility-switch race) are
// dropped before they can 404 against the session-scoped backend lookup.
function recordDeliveries(alerts: readonly FrontendAlert[], facilityId: string): void {
  for (const alert of alerts) {
    if (alert.facilityId !== facilityId) continue;
    void recordDashboardDelivery(alert).catch(() => undefined);
  }
}


function closeLiveConnection(): void {
  unsub?.();
  unsub = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
function deriveMergedStatuses(
  dashboard: DashboardResponse | null,
  statuses: Record<string, SpaceStatus>,
): Record<string, SpaceStatus> {
  if (!dashboard || !activeFacilityId) return statuses;
  const activeSpaceIds = new Set(dashboard.spaces.filter((space) => space.isActive).map((space) => space.id));
  const activeStatuses = Object.fromEntries(
    Object.entries(statuses).filter(([spaceId]) => activeSpaceIds.has(spaceId)),
  );
  const alerts = alertsForFacility(alertMergeState, activeFacilityId).filter((alert) =>
    activeSpaceIds.has(alert.spaceId),
  );
  return applyFreshness(deriveStatusesFromAlerts(activeStatuses, alerts));
}

// Keep the header summary tallies in sync with the live per-room statuses so an SSE
// alert/alert-updated frame updates the "위험 N건" headline/banner without a reload.
function deriveSummaryFromStatuses(
  base: DashboardSummary,
  statuses: Record<string, SpaceStatus>,
): DashboardSummary {
  let danger = 0;
  let caution = 0;
  let checkNeeded = 0;
  for (const s of Object.values(statuses)) {
    if (s.status === "DANGER") danger += 1;
    else if (s.status === "CAUTION") caution += 1;
    else if (s.status === "CHECK_NEEDED") checkNeeded += 1;
  }
  return {
    ...base,
    danger,
    caution,
    checkNeeded,
    stable: Math.max(0, base.totalSpaces - danger - caution - checkNeeded),
  };
}

function dashboardWithStatuses(
  dashboard: DashboardResponse | null,
  statuses: Record<string, SpaceStatus>,
): DashboardResponse | null {
  if (!dashboard) return dashboard;
  const unacknowledgedEvents = activeFacilityId
    ? alertsForFacility(alertMergeState, activeFacilityId).filter(isActiveAlert)
    : dashboard.unacknowledgedEvents;
  return {
    ...dashboard,
    statuses,
    unacknowledgedEvents,
    summary: {
      ...deriveSummaryFromStatuses(dashboard.summary, statuses),
      unacknowledged: unacknowledgedEvents.length,
    },
  };
}

async function reconcileSnapshot(facilityId: string): Promise<void> {
  const alerts = await fetchActiveAlertSnapshot();
  if (!isActiveFacility(facilityId)) return;
  alertMergeState = reconcileActiveAlertSnapshot(alertMergeState, facilityId, alerts);
  recordDeliveries(alerts, facilityId);
}

function eventSourceFor(facilityId: string): EventSource {
  const url = buildSseUrl(facilityId);
  return isAbsoluteApiUrl(url) ? new EventSource(url, { withCredentials: true }) : new EventSource(url);
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  dashboard: null,
  loading: true,
  statuses: {},
  connection: "NORMAL",
  lastUpdateAt: null,
  running: false,
  soundEnabled: false,

  start: (facilityId, intervalMs = 3000) => {

    if (activeFacilityId === facilityId && get().running) return;
    closeLiveConnection();
    activeFacilityId = facilityId;
    useFacilityStore.getState().setFacility(facilityId);
    alertMergeState = createAlertMergeState();
    // 새 시설로 갈아타면 이전 시설의 SSE 생존/신선도를 물려받지 않는다.
    sseHealthy = false;
    freshnessBySpace = {};
    set({ running: true, loading: true, connection: "RECONNECTING" });
    dashboardService.getDashboard(facilityId).then(async (dashboard) => {
      if (!isActiveFacility(facilityId)) return;
      alertMergeState = createAlertMergeState(dashboard.unacknowledgedEvents as FrontendAlert[]);
      recordDeliveries(dashboard.unacknowledgedEvents as FrontendAlert[], facilityId);
      await reconcileSnapshot(facilityId);
      await refreshCameraFreshness(facilityId);
      if (!isActiveFacility(facilityId)) return;
      const statuses = deriveMergedStatuses(dashboard, dashboard.statuses);
      set({
        dashboard: dashboardWithStatuses(dashboard, statuses),
        loading: false,
        statuses,
        connection: connectionAfterRestSuccess(),
        lastUpdateAt: new Date().toISOString(),
      });
    });
    pollTimer = setInterval(() => {
      if (!isActiveFacility(facilityId)) return;
      reconcileSnapshot(facilityId)
        .then(() => refreshCameraFreshness(facilityId))
        .then(() => {
          if (!isActiveFacility(facilityId)) return;
          set((state) => {
            const statuses = deriveMergedStatuses(state.dashboard, state.statuses);
            return {
              dashboard: dashboardWithStatuses(state.dashboard, statuses),
              statuses,
              connection: connectionAfterRestSuccess(),
              lastUpdateAt: new Date().toISOString(),
            };
          });
        })
        .catch(() => {
          if (isActiveFacility(facilityId)) set({ connection: "RECONNECTING" });
        });
    }, intervalMs);
    if (typeof EventSource === "undefined") return;
    const eventSource = eventSourceFor(facilityId);
    unsub = () => eventSource.close();
    // SSE가 실제로 열려야만 실시간 채널이 살아 있다고 주장한다.
    eventSource.onopen = () => {
      if (!isActiveFacility(facilityId)) return;
      sseHealthy = true;
      set({ connection: "NORMAL" });
    };
    const mergeAlertMessage = (event: MessageEvent) => {
      if (!isActiveFacility(facilityId)) return;
      // 프레임이 도착했다는 것 자체가 SSE 생존 증거다.
      sseHealthy = true;
      const alert = mapAlertDto(JSON.parse(event.data));
      alertMergeState = mergeAlerts(alertMergeState, [alert]);
      set((state) => {
        const statuses = deriveMergedStatuses(state.dashboard, state.statuses);
        return {
          dashboard: dashboardWithStatuses(state.dashboard, statuses),
          statuses,
          connection: "NORMAL",
          lastUpdateAt: alert.detectedAt,
        };
      });
      recordDeliveries([alert], facilityId);
    };
    eventSource.addEventListener("alert", (event) => mergeAlertMessage(event as MessageEvent));
    eventSource.addEventListener("alert-updated", (event) => {
      if (!isActiveFacility(facilityId)) return;
      const update = JSON.parse((event as MessageEvent).data) as AlertUpdateDelta;
      alertMergeState = mergeAlertUpdates(alertMergeState, [update]);
      set((state) => {
        const statuses = deriveMergedStatuses(state.dashboard, state.statuses);
        return {
          dashboard: dashboardWithStatuses(state.dashboard, statuses),
          statuses,
          connection: "NORMAL",
          lastUpdateAt: update.resolvedAt ?? new Date().toISOString(),
        };
      });
    });
    eventSource.onerror = () => {
      if (!isActiveFacility(facilityId)) return;
      sseHealthy = false;
      set({ connection: "RECONNECTING" });
      reconcileSnapshot(facilityId)
        .then(() => {
          if (!isActiveFacility(facilityId)) return;
          set((state) => {
            const statuses = deriveMergedStatuses(state.dashboard, state.statuses);
            return {
              dashboard: dashboardWithStatuses(state.dashboard, statuses),
              statuses,
              connection: connectionAfterRestSuccess(),
              lastUpdateAt: new Date().toISOString(),
            };
          });
        })
        .catch(() => {
          if (isActiveFacility(facilityId)) set({ connection: "RECONNECTING" });
        });
    };
    eventSource.addEventListener("session-invalid", () => {
      closeLiveConnection();
      alertMergeState = createAlertMergeState();
      activeFacilityId = null;
      useAuthStore.getState().logout().catch(() => {
        useAuthStore.setState({ user: null });
      });
      set({ connection: "DISCONNECTED", running: false, loading: false });
    });
  },

  reload: async () => {
    const facilityId = activeFacilityId;
    if (!facilityId) {
      useMonitorStore.setState({ dashboard: null, loading: false, statuses: {} });
      return;
    }
    useMonitorStore.setState({ loading: true });
    const dashboard = await dashboardService.getDashboard(facilityId);
    if (!isActiveFacility(facilityId)) return;
    alertMergeState = createAlertMergeState(dashboard.unacknowledgedEvents as FrontendAlert[]);
    recordDeliveries(dashboard.unacknowledgedEvents as FrontendAlert[], facilityId);
    await reconcileSnapshot(facilityId);
    if (!isActiveFacility(facilityId)) return;
    const statuses = deriveMergedStatuses(dashboard, dashboard.statuses);
    useMonitorStore.setState({
      dashboard: dashboardWithStatuses(dashboard, statuses),
      statuses,
      loading: false,
      connection: connectionAfterRestSuccess(),
      lastUpdateAt: new Date().toISOString(),
    });
  },

  stop: () => {
    closeLiveConnection();
    alertMergeState = createAlertMergeState();
    activeFacilityId = null;
    set({ running: false, dashboard: null, loading: false, statuses: {} });
  },

  resolve: async (spaceId) => {
    // 활성 시설을 캡처하고 절대 resurrect하지 않는다. stop/전환 이후엔 조용히 드롭한다.
    const facilityId = activeFacilityId;
    if (!facilityId) return;
    const alerts = await fetchActiveAlertSnapshot();
    if (!isActiveFacility(facilityId)) return;
    const alert = alerts
      .filter(
        (item) => item.spaceId === spaceId && item.facilityId === facilityId && isActiveAlert(item),
      )
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt))[0];
    if (!alert) return;
    alertMergeState = mergeAlerts(alertMergeState, alerts.filter((item) => item.facilityId === facilityId));
    const resolved = await resolveAlert(alert.id);
    if (!isActiveFacility(facilityId)) return;
    alertMergeState = mergeAlerts(alertMergeState, [resolved]);
    set((state) => {
      const statuses = deriveMergedStatuses(state.dashboard, state.statuses);
      return {
        dashboard: dashboardWithStatuses(state.dashboard, statuses),
        statuses,
        lastUpdateAt: resolved.acknowledgedAt ?? resolved.detectedAt,
      };
    });
  },
  setSound: (on) => set({ soundEnabled: on }),
}));

registerFacilityMonitorController({
  stop: () => useMonitorStore.getState().stop(),
  start: (id) => useMonitorStore.getState().start(id),
});
