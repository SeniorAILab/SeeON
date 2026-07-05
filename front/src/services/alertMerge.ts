import type { DashboardResponse, SpaceStatus } from "@/types";
import type { FrontendAlert } from "@/services/api/alertEndpoints";

const ACTIVE_BACKEND_TYPES = new Set(["fall", "bed-exit"]);
const RESOLVED_STATUS = "RESOLVED";

export interface AlertUpdateDelta {
  id: string;
  alertSeq: string | number;
  spaceId: string;
  status: string;
  resolvedById?: string | null;
  resolvedAt?: string | null;
}

export interface AlertMergeState {
  byId: Record<string, FrontendAlert>;
  highestSeqByFacility: Record<string, string>;
  terminalResolvedSeqById: Record<string, string>;
}

export function createAlertMergeState(alerts: FrontendAlert[] = []): AlertMergeState {
  return mergeAlerts({ byId: {}, highestSeqByFacility: {}, terminalResolvedSeqById: {} }, alerts);
}

export function compareAlertSeq(a: string | number | bigint, b: string | number | bigint): number {
  const left = BigInt(a);
  const right = BigInt(b);
  return left === right ? 0 : left > right ? 1 : -1;
}

export function mergeAlerts(state: AlertMergeState, incoming: FrontendAlert[]): AlertMergeState {
  const byId = { ...state.byId };
  const highestSeqByFacility = { ...state.highestSeqByFacility };
  const terminalResolvedSeqById = { ...state.terminalResolvedSeqById };
  for (const alert of incoming) {
    const incomingSeq = String(alert.alertSeq);
    const terminalSeq = terminalResolvedSeqById[alert.id];
    if (isResolvedBackendStatus(alert.backendStatus)) {
      if (!terminalSeq || compareAlertSeq(incomingSeq, terminalSeq) >= 0) terminalResolvedSeqById[alert.id] = incomingSeq;
    } else if (terminalSeq && compareAlertSeq(incomingSeq, terminalSeq) <= 0) {
      continue;
    }

    const existing = byId[alert.id];
    if (!existing || compareAlertSeq(incomingSeq, existing.alertSeq) >= 0) byId[alert.id] = alert;
    const current = highestSeqByFacility[alert.facilityId];
    if (!current || compareAlertSeq(incomingSeq, current) > 0) highestSeqByFacility[alert.facilityId] = incomingSeq;
  }
  return { byId, highestSeqByFacility, terminalResolvedSeqById };
}

export function mergeAck(state: AlertMergeState, alert: FrontendAlert): AlertMergeState {
  return mergeAlerts(state, [alert]);
}
export function mergeAlertUpdates(state: AlertMergeState, incoming: AlertUpdateDelta[]): AlertMergeState {
  const byId = { ...state.byId };
  const highestSeqByFacility = { ...state.highestSeqByFacility };
  const terminalResolvedSeqById = { ...state.terminalResolvedSeqById };

  for (const update of incoming) {
    const incomingSeq = String(update.alertSeq);
    const existing = byId[update.id];
    if (isResolvedBackendStatus(update.status)) {
      const terminalSeq = terminalResolvedSeqById[update.id];
      if (!terminalSeq || compareAlertSeq(incomingSeq, terminalSeq) >= 0) terminalResolvedSeqById[update.id] = incomingSeq;
    }
    if (existing && compareAlertSeq(incomingSeq, existing.alertSeq) >= 0) {
      byId[update.id] = {
        ...existing,
        alertSeq: incomingSeq,
        spaceId: update.spaceId,
        backendStatus: update.status,
        kakaoAlertStatus: mapBackendStatusToKakao(update.status),
        acknowledgedAt: isResolvedBackendStatus(update.status) ? (update.resolvedAt ?? existing.acknowledgedAt) : existing.acknowledgedAt,
        emergency: isResolvedBackendStatus(update.status) ? false : existing.emergency,
      };
      const current = highestSeqByFacility[existing.facilityId];
      if (!current || compareAlertSeq(incomingSeq, current) > 0) highestSeqByFacility[existing.facilityId] = incomingSeq;
    }
  }

  return { byId, highestSeqByFacility, terminalResolvedSeqById };
}

export function reconcileActiveAlertSnapshot(
  state: AlertMergeState,
  facilityId: string,
  snapshot: FrontendAlert[]
): AlertMergeState {
  const byId = Object.fromEntries(
    Object.entries(state.byId).filter(([, alert]) => alert.facilityId !== facilityId || !isActiveAlert(alert))
  );
  const next: AlertMergeState = {
    byId,
    highestSeqByFacility: { ...state.highestSeqByFacility },
    terminalResolvedSeqById: { ...state.terminalResolvedSeqById },
  };
  delete next.highestSeqByFacility[facilityId];
  return mergeAlerts(next, snapshot.filter((alert) => alert.facilityId === facilityId));
}

export function alertsForFacility(state: AlertMergeState, facilityId: string): FrontendAlert[] {
  return Object.values(state.byId)
    .filter((alert) => alert.facilityId === facilityId)
    .sort((a, b) => compareAlertSeq(b.alertSeq, a.alertSeq));
}

export function isActiveAlert(alert: FrontendAlert): boolean {
  return !isResolvedBackendStatus(alert.backendStatus) && ACTIVE_BACKEND_TYPES.has(alert.backendType);
}

function isResolvedBackendStatus(status: string): boolean {
  return status === RESOLVED_STATUS;
}

function mapBackendStatusToKakao(status: string): FrontendAlert["kakaoAlertStatus"] {
  return isResolvedBackendStatus(status) ? "ACKNOWLEDGED" : "PENDING";
}

function statusFromAlert(previous: SpaceStatus | undefined, alert: FrontendAlert): SpaceStatus {
  return {
    id: previous?.id ?? `status-${alert.spaceId}`,
    spaceId: alert.spaceId,
    peopleCount: previous?.peopleCount ?? 0,
    movementLevel: previous?.movementLevel ?? "HIGH",
    fallRiskLevel: previous?.fallRiskLevel ?? "HIGH",
    status: "DANGER",
    aiSummary: alert.aiSummary,
    lastDetectedAt: alert.detectedAt,
    kakaoAlertStatus: alert.kakaoAlertStatus,
    bedsideActivity: alert.eventType === "BED_EXIT" ? true : previous?.bedsideActivity,
    emergency: alert.emergency ?? true,
  };
}

function stableClearedStatus(status: SpaceStatus): SpaceStatus {
  return {
    ...status,
    movementLevel: "LOW",
    fallRiskLevel: "LOW",
    status: "STABLE",
    aiSummary: undefined,
    kakaoAlertStatus: "ACKNOWLEDGED",
    bedsideActivity: false,
    prolongedInactivity: undefined,
    soloMovementAttempt: undefined,
    emergency: false,
  };
}

function normalStatusFromAlert(previous: SpaceStatus | undefined, alert: FrontendAlert): SpaceStatus {
  return stableClearedStatus({
    id: previous?.id ?? `status-${alert.spaceId}`,
    spaceId: alert.spaceId,
    peopleCount: previous?.peopleCount ?? 0,
    movementLevel: "LOW",
    fallRiskLevel: "LOW",
    status: "STABLE",
    lastDetectedAt: alert.detectedAt,
    kakaoAlertStatus: "ACKNOWLEDGED",
  });
}

function latestBySeq(alerts: FrontendAlert[]): FrontendAlert | undefined {
  return alerts.reduce<FrontendAlert | undefined>((latest, alert) => {
    if (!latest || compareAlertSeq(alert.alertSeq, latest.alertSeq) > 0) return alert;
    return latest;
  }, undefined);
}

export function deriveStatusesFromAlerts(
  baseStatuses: Record<string, SpaceStatus>,
  alerts: FrontendAlert[]
): Record<string, SpaceStatus> {
  const alertsBySpace: Record<string, FrontendAlert[]> = {};
  for (const alert of alerts) {
    alertsBySpace[alert.spaceId] = [...(alertsBySpace[alert.spaceId] ?? []), alert];
  }

  const statuses = { ...baseStatuses };
  for (const [spaceId, spaceAlerts] of Object.entries(alertsBySpace)) {
    const active = latestBySeq(spaceAlerts.filter(isActiveAlert));
    const previous = baseStatuses[spaceId];
    if (active) {
      statuses[spaceId] = statusFromAlert(previous, active);
      continue;
    }

    const latest = latestBySeq(spaceAlerts);
    if (latest) statuses[spaceId] = normalStatusFromAlert(previous, latest);
  }

  for (const [spaceId, previous] of Object.entries(baseStatuses)) {
    if (!alertsBySpace[spaceId] && previous.status === "DANGER") {
      statuses[spaceId] = stableClearedStatus(previous);
    }
  }
  return statuses;
}

export function mergeAlertsIntoDashboard(data: DashboardResponse, alerts: FrontendAlert[]): DashboardResponse {
  const merged = createAlertMergeState([...(data.unacknowledgedEvents as FrontendAlert[]), ...alerts]);
  return applyAlertMergeStateToDashboard(data, merged);
}

export function mergeAlertUpdatesIntoDashboard(data: DashboardResponse, updates: AlertUpdateDelta[]): DashboardResponse {
  const merged = mergeAlertUpdates(createAlertMergeState(data.unacknowledgedEvents as FrontendAlert[]), updates);
  return applyAlertMergeStateToDashboard(data, merged);
}

export function applyAlertMergeStateToDashboard(data: DashboardResponse, merged: AlertMergeState): DashboardResponse {
  const facilityAlerts = alertsForFacility(merged, data.facility.id);
  const unacknowledgedEvents = facilityAlerts.filter(isActiveAlert);
  const statuses = deriveStatusesFromAlerts(data.statuses, facilityAlerts);
  return {
    ...data,
    statuses,
    unacknowledgedEvents,
    summary: {
      totalSpaces: Object.keys(statuses).length,
      stable: Object.values(statuses).filter((s) => s.status === "STABLE").length,
      caution: Object.values(statuses).filter((s) => s.status === "CAUTION").length,
      danger: Object.values(statuses).filter((s) => s.status === "DANGER").length,
      checkNeeded: Object.values(statuses).filter((s) => s.status === "CHECK_NEEDED").length,
      unacknowledged: unacknowledgedEvents.length,
    },
  };
}
