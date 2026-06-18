// Single mutable scenario source for demo mode.
//
// One browser-persistent store owns the clock, ids, fixtures, ACK state, and
// generated live events so the dashboard grid, alerts feed, and alert detail
// all read the same state and ACKs survive navigation + full refresh.
//
// On the server (no window) getScenario() returns a fresh deterministic seed
// and never persists; SSR initial render uses server-snapshot.ts, then the
// client hydrates this store in an effect — so first client render matches SSR.
import { mergeAlerts } from "../sse-utils";
import {
  BASE_TIME,
  CAMERAS,
  GUARDIANS,
  ORG,
  RESIDENTS,
  buildAlertHistory,
  buildStatuses,
} from "./fixtures";
import { loadScenario, saveScenario } from "./store";
import type {
  ResidentState,
  ScenarioState,
  SseAlert,
  SseStatusEvent,
} from "./types";

let state: ScenarioState | null = null;
const listeners = new Set<() => void>();

function seed(): ScenarioState {
  return {
    baseTime: BASE_TIME,
    nextSeq: 2000,
    residents: RESIDENTS,
    guardians: GUARDIANS,
    cameras: CAMERAS,
    alerts: mergeAlerts([], buildAlertHistory(BASE_TIME)),
    statuses: buildStatuses(BASE_TIME),
  };
}

export function getScenario(): ScenarioState {
  if (state) return state;
  state = loadScenario() ?? seed();
  return state;
}

function persist(): void {
  if (state) saveScenario(state);
}

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeScenario(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Acknowledge a NEW alert. Returns the updated alert, or null if not found/already acked. */
export function ackAlert(alertId: string): SseAlert | null {
  const s = getScenario();
  let acked: SseAlert | null = null;
  s.alerts = s.alerts.map((a) => {
    if (a.id === alertId && a.status === "NEW") {
      acked = { ...a, status: "ACKED" as const };
      return acked;
    }
    return a;
  });
  if (acked) {
    persist();
    emit();
  }
  return acked;
}

const GEN_TYPES = ["FALL", "BED_EXIT", "NO_MOTION"] as const;

function stateForAlert(type: string, probability: number): ResidentState {
  if (type === "FALL" && probability >= 0.8) return "FALL";
  if (probability >= 0.5) return "WARNING";
  return "NORMAL";
}

/** Generate one live event from the scenario clock. Mutates + persists state. */
export function generateEvent(now: number = Date.now()): {
  alert: SseAlert;
  status: SseStatusEvent;
} {
  const s = getScenario();
  const idx = s.nextSeq % s.residents.length;
  const res = s.residents[idx];
  const cam = s.cameras.find((c) => c.residentId === res.id) ?? null;
  const type = GEN_TYPES[s.nextSeq % GEN_TYPES.length];
  const probability =
    type === "FALL" ? 0.84 + (s.nextSeq % 4) * 0.03 : 0.5 + (s.nextSeq % 3) * 0.06;
  const rounded = Math.round(probability * 100) / 100;
  const detectedAt = new Date(now).toISOString();
  const seq = s.nextSeq + 1;
  const alert: SseAlert = {
    alertSeq: String(seq),
    id: `alg-${seq}`,
    orgId: ORG.id,
    residentId: res.id,
    cameraId: cam?.id ?? null,
    type,
    probability: rounded,
    detectedAt,
    status: "NEW",
    resident: { name: res.name, room: res.room },
  };
  const newState = stateForAlert(type, rounded);
  s.alerts = mergeAlerts(s.alerts, [alert]);
  s.statuses = s.statuses.map((st) =>
    st.residentId === res.id
      ? { ...st, state: newState, lastSeenAt: detectedAt, updatedAt: detectedAt }
      : st,
  );
  s.nextSeq = seq;
  persist();
  emit();
  const status: SseStatusEvent = {
    alertSeq: String(seq),
    orgId: ORG.id,
    residentId: res.id,
    state: newState,
    cameraOnline: cam?.online ?? false,
    lastSeenAt: detectedAt,
  };
  return { alert, status };
}

/** Test-only: drop the in-memory singleton (does NOT clear persisted storage,
 * so a fresh getScenario() rehydrates from the store — simulating a reload). */
export function __resetScenario(): void {
  state = null;
  listeners.clear();
}
