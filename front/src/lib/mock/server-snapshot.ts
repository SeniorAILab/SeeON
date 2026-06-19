// Deterministic, side-effect-free snapshot for server rendering in demo mode.
// Server module state is per-request/per-worker, so SSR must NOT pretend to own
// the mutable browser scenario. These pure builders give a stable initial
// render that the client then replaces/merges from the persistent store.
import { mergeAlerts } from "../sse-utils";
import { BASE_TIME, ORG, buildAlertHistory, buildStatuses } from "./fixtures";
import type { ResidentStatus, SseAlert } from "./types";

export function serverStatuses(): ResidentStatus[] {
  return buildStatuses(BASE_TIME);
}

export function serverAlerts(limit = 20): SseAlert[] {
  return mergeAlerts([], buildAlertHistory(BASE_TIME)).slice(0, limit);
}

export const serverOrg = ORG;
