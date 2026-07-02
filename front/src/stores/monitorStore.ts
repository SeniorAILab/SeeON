import { create } from "zustand";
import { acknowledgeAlert, listAlerts, mapAlertDto, type FrontendAlert } from "@/services/api/alertEndpoints";
import { buildSseUrl, isAbsoluteApiUrl, USE_MOCK } from "@/services/apiClient";
import { dashboardService } from "@/services/dashboardService";
import {
  alertsForFacility,
  createAlertMergeState,
  deriveStatusesFromAlerts,
  mergeAck,
  mergeAlerts,
  type AlertMergeState,
} from "@/services/alertMerge";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import { realtimeEngine } from "@/mocks/realtimeEngine";
import type { ConnectionState, SpaceStatus } from "@/types";

interface MonitorState {
  statuses: Record<string, SpaceStatus>;
  connection: ConnectionState;
  lastUpdateAt: string | null;
  running: boolean;
  soundEnabled: boolean;
  start: (facilityId: string, intervalMs?: number) => void;
  stop: () => void;
  acknowledge: (spaceId: string) => Promise<void> | void;
  setSound: (on: boolean) => void;
  trigger: (spaceId: string, emergency: boolean) => void;
}

let unsub: (() => void) | null = null;
let alertMergeState: AlertMergeState = createAlertMergeState();
let activeFacilityId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function deriveMergedStatuses(statuses: Record<string, SpaceStatus>): Record<string, SpaceStatus> {
  if (!activeFacilityId) return statuses;
  return deriveStatusesFromAlerts(statuses, alertsForFacility(alertMergeState, activeFacilityId));
}


export const useMonitorStore = create<MonitorState>((set) => ({
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

    activeFacilityId = facilityId;
    useFacilityStore.getState().setFacility(facilityId);
    alertMergeState = createAlertMergeState();
    set({ running: true, connection: "RECONNECTING" });
    dashboardService.getDashboard(facilityId).then((dashboard) => {
      alertMergeState = createAlertMergeState(dashboard.unacknowledgedEvents as FrontendAlert[]);
      set({
        statuses: deriveMergedStatuses(dashboard.statuses),
        connection: "NORMAL",
        lastUpdateAt: new Date().toISOString(),
      });
    });
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      listAlerts()
        .then((alerts) => {
          alertMergeState = mergeAlerts(alertMergeState, alerts.filter((alert) => alert.facilityId === facilityId));
          set((state) => ({
            statuses: deriveMergedStatuses(state.statuses),
            connection: "NORMAL",
            lastUpdateAt: new Date().toISOString(),
          }));
        })
        .catch(() => set({ connection: "RECONNECTING" }));
    }, intervalMs);
    if (typeof EventSource === "undefined") return;
    const url = buildSseUrl();
    const eventSource = isAbsoluteApiUrl(url)
      ? new EventSource(url, { withCredentials: true })
      : new EventSource(url);
    unsub = () => eventSource.close();
    eventSource.onmessage = (event) => {
      const alert = mapAlertDto(JSON.parse(event.data));
      alertMergeState = mergeAlerts(alertMergeState, [alert]);
      set((state) => ({
        statuses: deriveMergedStatuses(state.statuses),
        connection: "NORMAL",
        lastUpdateAt: alert.detectedAt,
      }));
    };
    eventSource.addEventListener("status", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { residentId?: string; spaceId?: string; state?: string; lastSeenAt?: string };
      if (!payload.spaceId) return;
      set((state) => ({
        statuses: {
          ...state.statuses,
          [payload.spaceId!]: {
            ...(state.statuses[payload.spaceId!] ?? {
              id: `status-${payload.spaceId}`,
              spaceId: payload.spaceId!,
              peopleCount: 0,
              movementLevel: "LOW",
              fallRiskLevel: "LOW",
              aiSummary: "",
              kakaoAlertStatus: "NONE",
            }),
            status: payload.state === "FALL" ? "DANGER" : payload.state === "WARNING" ? "CAUTION" : "STABLE",
            lastDetectedAt: payload.lastSeenAt ?? new Date().toISOString(),
          },
        },
        lastUpdateAt: payload.lastSeenAt ?? new Date().toISOString(),
        connection: "NORMAL",
      }));
    });
    eventSource.addEventListener("session-invalid", () => {
      eventSource.close();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      alertMergeState = createAlertMergeState();
      activeFacilityId = null;
      useAuthStore.getState().logout().catch(() => {
        useAuthStore.setState({ user: null });
      });
      set({ connection: "DISCONNECTED", running: false });
    });
  },

  stop: () => {
    unsub?.();
    unsub = null;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    alertMergeState = createAlertMergeState();
    activeFacilityId = null;
    if (USE_MOCK) realtimeEngine.stop();
    set({ running: false });
  },

  acknowledge: async (spaceId) => {
    if (USE_MOCK) {
      realtimeEngine.acknowledge(spaceId);
      return;
    }
    const alerts = await listAlerts();
    const alert = alerts
      .filter((item) => item.spaceId === spaceId && item.kakaoAlertStatus !== "ACKNOWLEDGED" && item.riskLevel !== "LOW")
      .sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt))[0];
    if (!alert) return;
    activeFacilityId = activeFacilityId ?? alert.facilityId;
    alertMergeState = mergeAlerts(alertMergeState, alerts.filter((item) => item.facilityId === alert.facilityId));
    const acknowledged = await acknowledgeAlert(alert.id);
    alertMergeState = mergeAck(alertMergeState, acknowledged);
    set((state) => ({
      statuses: deriveMergedStatuses(state.statuses),
      lastUpdateAt: acknowledged.acknowledgedAt ?? acknowledged.detectedAt,
    }));
  },
  setSound: (on) => set({ soundEnabled: on }),
  trigger: (spaceId, emergency) => {
    if (USE_MOCK) realtimeEngine.trigger(spaceId, emergency);
  },
}));
