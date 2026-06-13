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
