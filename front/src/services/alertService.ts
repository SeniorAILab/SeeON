import type { AlertView } from "@/types";
import { listAlertsEndpoint, resolveAlertEndpoint } from "./api/alertEndpoints";
import { createAlertNote, listAlertNotes, type AlertNote } from "./api/alertNotes";
import {
  getAlertMediaEndpoint,
  recordAlertMediaAccessEndpoint,
  type AlertMediaAccessRequest,
  type AlertMediaMetadata,
} from "./api/alertMedia";

export const alertService = {
  listOpen(): Promise<AlertView[]> {
    return listAlertsEndpoint({ status: "NEW" });
  },
  listAcknowledged(): Promise<AlertView[]> {
    return listAlertsEndpoint({ status: "ACKED" });
  },
  listResolved(): Promise<AlertView[]> {
    return listAlertsEndpoint({ status: "RESOLVED" });
  },
  listRecent(limit = 100): Promise<AlertView[]> {
    return listAlertsEndpoint({ limit });
  },
  async openAlertForSpace(spaceId: string): Promise<AlertView | null> {
    const open = await listAlertsEndpoint({ status: "NEW" });
    return open.find((alert) => alert.spaceId === spaceId) ?? null;
  },
  async ackedAlertForSpace(spaceId: string): Promise<AlertView | null> {
    const acked = await listAlertsEndpoint({ status: "ACKED" });
    return acked.find((alert) => alert.spaceId === spaceId) ?? null;
  },
  resolve(id: string): Promise<AlertView> {
    return resolveAlertEndpoint(id);
  },
  listNotes(alertId: string): Promise<AlertNote[]> {
    return listAlertNotes(alertId);
  },
  createNote(alertId: string, note: string): Promise<AlertNote> {
    return createAlertNote(alertId, note);
  },
  getMedia(alertId: string, signal: AbortSignal): Promise<AlertMediaMetadata> {
    return getAlertMediaEndpoint(alertId, signal);
  },
  recordMediaAccess(request: AlertMediaAccessRequest): Promise<void> {
    return recordAlertMediaAccessEndpoint(request);
  },
};
export type { AlertNote } from "./api/alertNotes";
export type { AlertMediaAccessRequest, AlertMediaMetadata } from "./api/alertMedia";
