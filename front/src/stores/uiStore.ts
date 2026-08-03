import { create } from "zustand";

type Theme = "light" | "dark";

/**
 * 테마 전용 스토어.
 *
 * 소리 상태는 여기 두지 않는다. 예전에는 `uiStore.soundEnabled`(기본 켜짐)와
 * `monitorSettingsStore.alertSound`(기본 꺼짐)가 따로 존재해서, 헤더는
 * "소리 알림 켜짐"이라고 표시하는데 실제 TTS는 울리지 않았다. 소리의 SSOT는
 * `monitorSettingsStore.alertSound` 하나다.
 */
interface UiState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const THEME_KEY = "senai.theme";

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  // 야간(19시~7시)에는 자동 다크 — 야간 근무자 배려
  const hour = new Date().getHours();
  return hour >= 19 || hour < 7 ? "dark" : "light";
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme(),
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    set({ theme: next });
  },
  setTheme: (t) => {
    localStorage.setItem(THEME_KEY, t);
    set({ theme: t });
  },
}));
