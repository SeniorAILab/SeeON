// Browser-persistent store for the scenario + selected role.
// SSR-safe: acquisition of localStorage is itself wrapped in try/catch so a
// privacy-restricted browser (where the `localStorage` getter throws
// SecurityError) degrades to in-memory only instead of crashing the demo.
import type { DemoRole, ScenarioState } from "./types";

const SCENARIO_KEY = "hhy.scenario.v1";
const ROLE_KEY = "hhy.role.v1";

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadScenario(): ScenarioState | null {
  const ls = getStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(SCENARIO_KEY);
    return raw ? (JSON.parse(raw) as ScenarioState) : null;
  } catch {
    return null;
  }
}

export function saveScenario(state: ScenarioState): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(SCENARIO_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private-mode failures — runtime state still lives in memory
  }
}

export function loadRole(): DemoRole | null {
  const ls = getStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(ROLE_KEY);
    return raw === "CAREGIVER" || raw === "OWNER" || raw === "ADMIN"
      ? raw
      : null;
  } catch {
    return null;
  }
}

export function saveRole(role: DemoRole): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(ROLE_KEY, role);
  } catch {
    // ignore
  }
}

export const STORAGE_KEYS = { SCENARIO_KEY, ROLE_KEY };
