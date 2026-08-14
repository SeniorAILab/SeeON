import { create } from "zustand";
import type { MonitorSettings } from "@/types";

const KEY = "senai.monitor.settings";

const DEFAULTS: MonitorSettings = {
  defaultFloorId: "",
  refreshMs: 6000, // 현실감을 위해 5~10초 권장
  // 소리 알림의 SSOT. TV에 상시 띄워둔 화면에서 요양보호사가 낙상 알림을
  // 소리로 받는 것이 기본 운영 형태이므로 켜짐으로 시작한다.
  // (autoplay 차단 가능성은 소리 토글 UI에서 안내로 처리한다.)
  alertSound: true,
  cardSize: "lg", // 14공간 화면 기준 기본 크기
  visibleSpaceIds: null,
  allowAllView: true,
};

function persistedSettings(value: MonitorSettings): MonitorSettings {
  return {
    defaultFloorId: value.defaultFloorId,
    refreshMs: value.refreshMs,
    alertSound: value.alertSound,
    cardSize: value.cardSize,
    visibleSpaceIds: value.visibleSpaceIds,
    allowAllView: value.allowAllView,
  };
}

function load(): MonitorSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const { nightMode: _ignoredLegacyTheme, ...rest } = parsed;
      const settings = persistedSettings({
        ...DEFAULTS,
        ...(rest as Partial<MonitorSettings>),
      });
      if (!settings.allowAllView && settings.defaultFloorId === "all") {
        return { ...settings, defaultFloorId: DEFAULTS.defaultFloorId };
      }
      return settings;
    }
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
    const merged = persistedSettings({ ...get(), ...patch });
    const next =
      !merged.allowAllView && merged.defaultFloorId === "all"
        ? { ...merged, defaultFloorId: DEFAULTS.defaultFloorId }
        : merged;
    localStorage.setItem(KEY, JSON.stringify(next));
    set(next);
  },
  reset: () => {
    localStorage.setItem(KEY, JSON.stringify(DEFAULTS));
    set(DEFAULTS);
  },
}));
