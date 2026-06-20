import { create } from "zustand";
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
  acknowledge: (spaceId: string) => void;
  setSound: (on: boolean) => void;
  trigger: (spaceId: string, emergency: boolean) => void;
}

let unsub: (() => void) | null = null;

export const useMonitorStore = create<MonitorState>((set) => ({
  statuses: {},
  connection: "NORMAL",
  lastUpdateAt: null,
  running: false,
  soundEnabled: false,

  start: (facilityId, intervalMs = 3000) => {
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
  },

  stop: () => {
    unsub?.();
    unsub = null;
    realtimeEngine.stop();
    set({ running: false });
  },

  acknowledge: (spaceId) => realtimeEngine.acknowledge(spaceId),
  setSound: (on) => set({ soundEnabled: on }),
  trigger: (spaceId, emergency) => realtimeEngine.trigger(spaceId, emergency),
}));
