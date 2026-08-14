import { create } from "zustand";

export type Theme = "light" | "dark";

/**
 * Appearance SSOT (화면 모드). Light / Dark, with System only as the
 * unsaved default via prefers-color-scheme — not a 19:00–07:00 clock.
 *
 * Sound does not live here. It used to: `uiStore.soundEnabled` (default on)
 * and `monitorSettingsStore.alertSound` (default off) drifted, so the header
 * said "on" while TTS stayed silent. Sound SSOT is `alertSound`.
 */
interface UiState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const THEME_KEY = "senai.theme";

export function resolveAppearanceTheme(saved: string | null, prefersDark: boolean): Theme {
  if (saved === "light" || saved === "dark") return saved;
  return prefersDark ? "dark" : "light";
}

export function applyHtmlAppearance(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function prefersColorSchemeDark(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function initialTheme(): Theme {
  return resolveAppearanceTheme(localStorage.getItem(THEME_KEY), prefersColorSchemeDark());
}

function persistTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  applyHtmlAppearance(theme);
}

const theme = initialTheme();
applyHtmlAppearance(theme);

export const useUiStore = create<UiState>((set, get) => ({
  theme,
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    persistTheme(next);
    set({ theme: next });
  },
  setTheme: (t) => {
    persistTheme(t);
    set({ theme: t });
  },
}));
