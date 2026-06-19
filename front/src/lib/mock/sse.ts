// Idempotent mock SSE scheduler. A single interval drives all subscribers, so
// remounts (dashboard + alerts both mounting the stream) never create duplicate
// timers or duplicate event bursts.
import { generateEvent } from "./scenario";
import type { SseAlert, SseStatusEvent } from "./types";

type AlertCb = (alert: SseAlert) => void;
type StatusCb = (status: SseStatusEvent) => void;

let timer: ReturnType<typeof setInterval> | null = null;
let timersCreated = 0;
const alertSubs = new Set<AlertCb>();
const statusSubs = new Set<StatusCb>();

export const DEFAULT_INTERVAL_MS = 12_000;

export function startMockSse(
  onAlert: AlertCb,
  onStatus: StatusCb,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): () => void {
  alertSubs.add(onAlert);
  statusSubs.add(onStatus);

  if (timer === null) {
    timersCreated += 1;
    timer = setInterval(() => {
      const { alert, status } = generateEvent();
      for (const cb of alertSubs) cb(alert);
      for (const cb of statusSubs) cb(status);
    }, intervalMs);
  }

  return () => {
    alertSubs.delete(onAlert);
    statusSubs.delete(onStatus);
    if (alertSubs.size === 0 && statusSubs.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Test/introspection: how many timers have been created (idempotency check). */
export function __timersCreated(): number {
  return timersCreated;
}

export function __resetScheduler(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  timersCreated = 0;
  alertSubs.clear();
  statusSubs.clear();
}
