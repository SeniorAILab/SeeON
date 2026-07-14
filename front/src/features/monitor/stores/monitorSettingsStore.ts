import { create } from "zustand";
import type { MonitorSettings } from "@/types";

const KEY = "senai.monitor.settings";

const DEFAULTS: MonitorSettings = {
  defaultFloorId: "fl_2f",
  refreshMs: 6000, // 현실감을 위해 5~10초 권장
  alertSound: false, // 소리 기본값은 꺼짐
  nightMode: false,
  cardSize: "lg", // 14공간 화면 기준 기본 크기
  visibleSpaceIds: null,
  allowAllView: true,
};

function load(): MonitorSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

interface SettingsState extends MonitorSettings {
  update: (patch: Partial<MonitorSettings>) => void;
  reset: () => void;
}

export const useMonitorSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  update: (patch) => {
    const next = { ...get(), ...patch };
    if (!next.allowAllView && next.defaultFloorId === "all") {
      next.defaultFloorId = DEFAULTS.defaultFloorId;
    }
    const { update: _u, reset: _r, ...data } = next;
    localStorage.setItem(KEY, JSON.stringify(data));
    set(next);
  },
  reset: () => {
    localStorage.setItem(KEY, JSON.stringify(DEFAULTS));
    set(DEFAULTS);
  },
}));
