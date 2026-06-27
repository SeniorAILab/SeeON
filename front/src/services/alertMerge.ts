import type { DashboardResponse, SpaceStatus } from "@/types";
import type { FrontendAlert } from "@/services/api/alertEndpoints";

export interface AlertMergeState {
  byId: Record<string, FrontendAlert>;
  highestSeqByFacility: Record<string, string>;
}

export function createAlertMergeState(alerts: FrontendAlert[] = []): AlertMergeState {
  return mergeAlerts({ byId: {}, highestSeqByFacility: {} }, alerts);
}

export function compareAlertSeq(a: string | number | bigint, b: string | number | bigint): number {
  const left = BigInt(a);
  const right = BigInt(b);
  return left === right ? 0 : left > right ? 1 : -1;
}

export function mergeAlerts(state: AlertMergeState, incoming: FrontendAlert[]): AlertMergeState {
  const byId = { ...state.byId };
  const highestSeqByFacility = { ...state.highestSeqByFacility };
  for (const alert of incoming) {
    const existing = byId[alert.id];
    if (!existing || compareAlertSeq(alert.alertSeq, existing.alertSeq) >= 0) byId[alert.id] = alert;
    const current = highestSeqByFacility[alert.facilityId];
    if (!current || compareAlertSeq(alert.alertSeq, current) > 0) highestSeqByFacility[alert.facilityId] = alert.alertSeq;
  }
  return { byId, highestSeqByFacility };
}

export function mergeAck(state: AlertMergeState, alert: FrontendAlert): AlertMergeState {
  return mergeAlerts(state, [alert]);
}

export function alertsForFacility(state: AlertMergeState, facilityId: string): FrontendAlert[] {
  return Object.values(state.byId)
    .filter((alert) => alert.facilityId === facilityId)
    .sort((a, b) => compareAlertSeq(b.alertSeq, a.alertSeq));
}

function isActiveAlert(alert: FrontendAlert): boolean {
  return alert.kakaoAlertStatus !== "ACKNOWLEDGED" && alert.riskLevel !== "LOW";
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

function acknowledgedStatusFromAlert(previous: SpaceStatus | undefined, alert: FrontendAlert): SpaceStatus {
  return {
    id: previous?.id ?? `status-${alert.spaceId}`,
    spaceId: alert.spaceId,
    peopleCount: previous?.peopleCount ?? 0,
    movementLevel: "LOW",
    fallRiskLevel: "LOW",
    status: "STABLE",
    aiSummary: alert.aiSummary,
    lastDetectedAt: alert.detectedAt,
    kakaoAlertStatus: "ACKNOWLEDGED",
    bedsideActivity: false,
    prolongedInactivity: previous?.prolongedInactivity,
    soloMovementAttempt: previous?.soloMovementAttempt,
    emergency: false,
  };
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
    if (latest) statuses[spaceId] = acknowledgedStatusFromAlert(previous, latest);
  }

  return statuses;
}

export function mergeAlertsIntoDashboard(data: DashboardResponse, alerts: FrontendAlert[]): DashboardResponse {
  const merged = createAlertMergeState([...(data.unacknowledgedEvents as FrontendAlert[]), ...alerts]);
  const unacknowledgedEvents = alertsForFacility(merged, data.facility.id).filter(
    (alert) => alert.kakaoAlertStatus !== "ACKNOWLEDGED" && alert.riskLevel !== "LOW"
  );
  const statuses = deriveStatusesFromAlerts(data.statuses, alertsForFacility(merged, data.facility.id));
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
