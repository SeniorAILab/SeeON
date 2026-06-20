import { create } from "zustand";

type Theme = "light" | "dark";

interface UiState {
  theme: Theme;
  soundEnabled: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  toggleSound: () => void;
}

const THEME_KEY = "senai.theme";
const SOUND_KEY = "senai.sound";

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  // 야간(19시~7시)에는 자동 다크 — 야간 근무자 배려
  const hour = new Date().getHours();
  return hour >= 19 || hour < 7 ? "dark" : "light";
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme(),
  soundEnabled: localStorage.getItem(SOUND_KEY) !== "off",

  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    set({ theme: next });
  },
  setTheme: (t) => {
    localStorage.setItem(THEME_KEY, t);
    set({ theme: t });
  },
  toggleSound: () => {
    const next = !get().soundEnabled;
    localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    set({ soundEnabled: next });
  },
}));
