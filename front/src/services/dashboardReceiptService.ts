import {
  postDashboardReceipt,
  type DashboardReceiptKind,
  type DashboardReceiptResponse,
} from "@/services/api/dashboardReceiptEndpoints";
import type { DetectionEvent } from "@/types";

const CLIENT_ID_STORAGE_KEY = "eldercare.dashboard-client-id.v1";

export type DashboardReceiptSurfaceBase =
  | "admin-room-board"
  | "monitor-room-board";

export type DashboardReceiptSurface =
  `${DashboardReceiptSurfaceBase}:${"overview" | "focus"}`;

/** The only alert fields receipt recording needs. */
export type ReceiptAlertRef = Pick<
  DetectionEvent,
  "id" | "alertSeq" | "backendEventId"
>;

export type { DashboardReceiptResponse };

const completed = new Map<string, DashboardReceiptResponse>();
const pending = new Map<string, Promise<DashboardReceiptResponse | null>>();

export function getDashboardClientId(): string {
  const stored = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (stored) return stored;
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `dashboard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
  return id;
}

export function recordDashboardDelivery(
  alert: ReceiptAlertRef,
): Promise<DashboardReceiptResponse | null> {
  return recordReceipt(alert, "delivery", "normalized-feed");
}

export function recordDashboardPresentation(
  alert: ReceiptAlertRef,
  surface: DashboardReceiptSurface,
): Promise<DashboardReceiptResponse | null> {
  return recordReceipt(alert, "presentation", surface);
}

function recordReceipt(
  alert: ReceiptAlertRef,
  kind: DashboardReceiptKind,
  surface: string,
): Promise<DashboardReceiptResponse | null> {
  if (!alert.backendEventId || !alert.alertSeq) return Promise.resolve(null);

  const dashboardClientId = getDashboardClientId();
  const key = [dashboardClientId, kind, alert.id, alert.alertSeq, surface].join(":");
  const existing = completed.get(key);
  if (existing) return Promise.resolve(existing);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const request = postDashboardReceipt(kind, {
    dashboardClientId,
    backendEventId: alert.backendEventId,
    alertId: alert.id,
    alertSeq: alert.alertSeq,
    observedAt: new Date().toISOString(),
    ...(kind === "presentation" ? { surface } : {}),
  })
    .then((value) => {
      completed.set(key, value);
      return value;
    })
    .finally(() => pending.delete(key));

  pending.set(key, request);
  return request;
}
