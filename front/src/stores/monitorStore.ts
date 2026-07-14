import { create } from "zustand";
import { fetchActiveAlertSnapshot, mapAlertDto, resolveAlert, type FrontendAlert } from "@/services/api/alertEndpoints";
import { buildSseUrl, isAbsoluteApiUrl } from "@/services/apiClient";
import { dashboardService } from "@/services/dashboardService";
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
function isActiveFacility(facilityId: string): boolean {
  return activeFacilityId === facilityId;
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
  return deriveStatusesFromAlerts(activeStatuses, alerts);
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
  return { ...dashboard, statuses, summary: deriveSummaryFromStatuses(dashboard.summary, statuses) };
}

async function reconcileSnapshot(facilityId: string): Promise<void> {
  const alerts = await fetchActiveAlertSnapshot();
  if (!isActiveFacility(facilityId)) return;
  alertMergeState = reconcileActiveAlertSnapshot(alertMergeState, facilityId, alerts);
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
    set({ running: true, loading: true, connection: "RECONNECTING" });
    dashboardService.getDashboard(facilityId).then(async (dashboard) => {
      if (!isActiveFacility(facilityId)) return;
      alertMergeState = createAlertMergeState(dashboard.unacknowledgedEvents as FrontendAlert[]);
      await reconcileSnapshot(facilityId);
      if (!isActiveFacility(facilityId)) return;
      const statuses = deriveMergedStatuses(dashboard, dashboard.statuses);
      set({
        dashboard: dashboardWithStatuses(dashboard, statuses),
        loading: false,
        statuses,
        connection: "NORMAL",
        lastUpdateAt: new Date().toISOString(),
      });
    });
    pollTimer = setInterval(() => {
      if (!isActiveFacility(facilityId)) return;
      reconcileSnapshot(facilityId)
        .then(() => {
          if (!isActiveFacility(facilityId)) return;
          set((state) => {
            const statuses = deriveMergedStatuses(state.dashboard, state.statuses);
            return {
              dashboard: dashboardWithStatuses(state.dashboard, statuses),
              statuses,
              connection: "NORMAL",
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
    const mergeAlertMessage = (event: MessageEvent) => {
      if (!isActiveFacility(facilityId)) return;
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
      set({ connection: "RECONNECTING" });
      reconcileSnapshot(facilityId)
        .then(() => {
          if (!isActiveFacility(facilityId)) return;
          set((state) => {
            const statuses = deriveMergedStatuses(state.dashboard, state.statuses);
            return {
              dashboard: dashboardWithStatuses(state.dashboard, statuses),
              statuses,
              connection: "NORMAL",
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
    await reconcileSnapshot(facilityId);
    if (!isActiveFacility(facilityId)) return;
    const statuses = deriveMergedStatuses(dashboard, dashboard.statuses);
    useMonitorStore.setState({
      dashboard: dashboardWithStatuses(dashboard, statuses),
      statuses,
      loading: false,
      connection: "NORMAL",
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
