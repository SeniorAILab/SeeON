import { create } from "zustand";
import { fetchActiveAlertSnapshot, mapAlertDto, resolveAlert, type FrontendAlert } from "@/services/api/alertEndpoints";
import { buildSseUrl, isAbsoluteApiUrl, USE_MOCK } from "@/services/apiClient";
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
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import { realtimeEngine } from "@/mocks/realtimeEngine";
import type { ConnectionState, DashboardResponse, SpaceStatus } from "@/types";

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
  trigger: (spaceId: string, emergency: boolean) => void;
}

let unsub: (() => void) | null = null;
let alertMergeState: AlertMergeState = createAlertMergeState();
let activeFacilityId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;


function closeLiveConnection(): void {
  unsub?.();
  unsub = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
function deriveMergedStatuses(statuses: Record<string, SpaceStatus>): Record<string, SpaceStatus> {
  if (!activeFacilityId) return statuses;
  return deriveStatusesFromAlerts(statuses, alertsForFacility(alertMergeState, activeFacilityId));
}

async function reconcileSnapshot(facilityId: string): Promise<void> {
  const alerts = await fetchActiveAlertSnapshot();
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
    if (USE_MOCK) {
      realtimeEngine.start(facilityId, intervalMs);
      if (!unsub) {
        unsub = realtimeEngine.subscribe((snap) =>
          set({
            statuses: snap.statuses,
            connection: snap.connection,
            lastUpdateAt: snap.lastUpdateAt,
          })
        );
      }
      set({ running: true });
      return;
    }

    if (activeFacilityId === facilityId && get().running) return;
    closeLiveConnection();
    activeFacilityId = facilityId;
    useFacilityStore.getState().setFacility(facilityId);
    alertMergeState = createAlertMergeState();
    set({ running: true, loading: true, connection: "RECONNECTING" });
    dashboardService.getDashboard(facilityId).then(async (dashboard) => {
      alertMergeState = createAlertMergeState(dashboard.unacknowledgedEvents as FrontendAlert[]);
      await reconcileSnapshot(facilityId);
      const statuses = deriveMergedStatuses(dashboard.statuses);
      set({
        dashboard: { ...dashboard, statuses },
        loading: false,
        statuses,
        connection: "NORMAL",
        lastUpdateAt: new Date().toISOString(),
      });
    });
    pollTimer = setInterval(() => {
      reconcileSnapshot(facilityId)
        .then(() => {
          set((state) => {
            const statuses = deriveMergedStatuses(state.statuses);
            return {
              dashboard: state.dashboard ? { ...state.dashboard, statuses } : state.dashboard,
              statuses,
              connection: "NORMAL",
              lastUpdateAt: new Date().toISOString(),
            };
          });
        })
        .catch(() => set({ connection: "RECONNECTING" }));
    }, intervalMs);
    if (typeof EventSource === "undefined") return;
    const eventSource = eventSourceFor(facilityId);
    unsub = () => eventSource.close();
    const mergeAlertMessage = (event: MessageEvent) => {
      const alert = mapAlertDto(JSON.parse(event.data));
      alertMergeState = mergeAlerts(alertMergeState, [alert]);
      set((state) => {
        const statuses = deriveMergedStatuses(state.statuses);
        return {
          dashboard: state.dashboard ? { ...state.dashboard, statuses } : state.dashboard,
          statuses,
          connection: "NORMAL",
          lastUpdateAt: alert.detectedAt,
        };
      });
    };
    eventSource.addEventListener("alert", (event) => mergeAlertMessage(event as MessageEvent));
    eventSource.addEventListener("alert-updated", (event) => {
      const update = JSON.parse((event as MessageEvent).data) as AlertUpdateDelta;
      alertMergeState = mergeAlertUpdates(alertMergeState, [update]);
      set((state) => {
        const statuses = deriveMergedStatuses(state.statuses);
        return {
          dashboard: state.dashboard ? { ...state.dashboard, statuses } : state.dashboard,
          statuses,
          connection: "NORMAL",
          lastUpdateAt: update.resolvedAt ?? new Date().toISOString(),
        };
      });
    });
    eventSource.onerror = () => {
      set({ connection: "RECONNECTING" });
      reconcileSnapshot(facilityId)
        .then(() => {
          set((state) => {
            const statuses = deriveMergedStatuses(state.statuses);
            return {
              dashboard: state.dashboard ? { ...state.dashboard, statuses } : state.dashboard,
              statuses,
              connection: "NORMAL",
              lastUpdateAt: new Date().toISOString(),
            };
          });
        })
        .catch(() => set({ connection: "RECONNECTING" }));
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
    alertMergeState = createAlertMergeState(dashboard.unacknowledgedEvents as FrontendAlert[]);
    await reconcileSnapshot(facilityId);
    const statuses = deriveMergedStatuses(dashboard.statuses);
    useMonitorStore.setState({
      dashboard: { ...dashboard, statuses },
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
    if (USE_MOCK) realtimeEngine.stop();
    set({ running: false, dashboard: null, loading: false, statuses: {} });
  },

  resolve: async (spaceId) => {
    if (USE_MOCK) {
      realtimeEngine.acknowledge(spaceId);
      return;
    }
    const alerts = await fetchActiveAlertSnapshot();
    const alert = alerts
      .filter((item) => item.spaceId === spaceId && isActiveAlert(item))
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt))[0];
    if (!alert) return;
    activeFacilityId = activeFacilityId ?? alert.facilityId;
    alertMergeState = mergeAlerts(alertMergeState, alerts.filter((item) => item.facilityId === alert.facilityId));
    const resolved = await resolveAlert(alert.id);
    alertMergeState = mergeAlerts(alertMergeState, [resolved]);
    set((state) => {
      const statuses = deriveMergedStatuses(state.statuses);
      return {
        dashboard: state.dashboard ? { ...state.dashboard, statuses } : state.dashboard,
        statuses,
        lastUpdateAt: resolved.acknowledgedAt ?? resolved.detectedAt,
      };
    });
  },
  setSound: (on) => set({ soundEnabled: on }),
  trigger: (spaceId, emergency) => {
    if (USE_MOCK) realtimeEngine.trigger(spaceId, emergency);
  },
}));
