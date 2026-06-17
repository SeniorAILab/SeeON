/**
 * Pure utility functions for the SSE alert stream.
 * No browser or React dependencies — importable in Node for unit tests.
 */

export type AlertStatus = "NEW" | "ACKED" | "RESOLVED";
export type ResidentState = "NORMAL" | "WARNING" | "FALL";

export interface SseAlert {
  alertSeq: string; // BigInt serialized as string
  id: string;
  orgId: string;
  residentId: string;
  cameraId: string | null;
  type: string;
  probability: number;
  detectedAt: string;
  status: AlertStatus;
  snapshotKey?: string | null;
  resident?: { name: string; room: string | null } | null;
}

export interface ResidentStatus {
  id: string;
  residentId: string;
  orgId: string;
  state: ResidentState;
  lastSeenAt: string | null;
  cameraOnline: boolean;
  source: string | null;
  updatedAt: string;
  resident?: { name: string; room: string | null } | null;
}

/**
 * Payload of the named `event: status` SSE frame emitted by the backend
 * after each committed alert (AC5/AC6 live resident status badge).
 */
export interface SseStatusEvent {
  alertSeq: string; // BigInt serialized as string
  orgId: string;
  residentId: string;
  state: ResidentState;
  cameraOnline: boolean;
  lastSeenAt: string | null;
}

/**
 * Sort alerts descending by alertSeq (most-recent first).
 * alertSeq is a BigInt serialized as a decimal string.
 */
export function sortAlertsBySeq(alerts: SseAlert[]): SseAlert[] {
  return [...alerts].sort((a, b) => {
    const seqA = BigInt(a.alertSeq);
    const seqB = BigInt(b.alertSeq);
    if (seqB > seqA) return 1;
    if (seqB < seqA) return -1;
    return 0;
  });
}

/**
 * Merge incoming alerts into the existing array.
 * Deduplicates by alertSeq, then sorts descending.
 */
export function mergeAlerts(
  existing: SseAlert[],
  incoming: SseAlert[],
): SseAlert[] {
  const map = new Map<string, SseAlert>();
  for (const a of existing) map.set(a.alertSeq, a);
  for (const a of incoming) map.set(a.alertSeq, a); // incoming wins on dup
  return sortAlertsBySeq(Array.from(map.values()));
}

/**
 * Merge a live `event: status` payload into the existing statuses array.
 * Updates the matching resident's state, cameraOnline, and lastSeenAt.
 * If the resident is not yet in the array, appends a minimal entry.
 * Preserves all other fields (name, room, id, updatedAt, etc.) from snapshot.
 */
export function mergeStatuses(
  existing: ResidentStatus[],
  incoming: SseStatusEvent,
): ResidentStatus[] {
  const idx = existing.findIndex((s) => s.residentId === incoming.residentId);
  if (idx === -1) {
    // Resident not yet in list — add a minimal entry so the badge appears.
    return [
      ...existing,
      {
        id: incoming.residentId,
        residentId: incoming.residentId,
        orgId: incoming.orgId,
        state: incoming.state,
        lastSeenAt: incoming.lastSeenAt,
        cameraOnline: incoming.cameraOnline,
        source: null,
        updatedAt: new Date().toISOString(),
      },
    ];
  }
  return existing.map((s, i) =>
    i === idx
      ? {
          ...s,
          state: incoming.state,
          cameraOnline: incoming.cameraOnline,
          lastSeenAt: incoming.lastSeenAt,
        }
      : s,
  );
}

/**
 * Mask a guardian phone number for display.
 * e.g. "01012345678" → "010-****-5678"
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***-****-****";
  const prefix = digits.slice(0, 3);
  const suffix = digits.slice(-4);
  return `${prefix}-****-${suffix}`;
}

/** Alert status → Korean label. */
export const ALERT_STATUS_LABELS: Record<string, string> = {
  NEW: "신규",
  ACKED: "확인됨",
  RESOLVED: "해결됨",
};

/** Format an ISO timestamp for ko-KR display; falls back to the raw string. */
export function formatTime(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "medium" },
): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", opts).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Resolve a resident's display name; "미지정" for null, id-prefix fallback. */
export function residentName(
  residents: { id: string; name: string }[],
  id: string | null,
): string {
  if (!id) return "미지정";
  return residents.find((r) => r.id === id)?.name ?? id.slice(0, 8);
}
