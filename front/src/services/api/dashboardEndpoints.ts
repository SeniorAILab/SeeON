import { requestJson } from "@/services/apiClient";
import { listAlerts } from "@/services/api/alertEndpoints";
import { mergeAlertsIntoDashboard } from "@/services/alertMerge";
import type { DashboardResponse, DashboardSummary, Facility, Floor, Space, SpaceStatus } from "@/types";

function expectArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${field} response`);
  return value as T[];
}

function buildSummary(statuses: Record<string, SpaceStatus>, unacknowledged: number): DashboardSummary {
  const list = Object.values(statuses);
  return {
    totalSpaces: list.length,
    stable: list.filter((s) => s.status === "STABLE").length,
    caution: list.filter((s) => s.status === "CAUTION").length,
    danger: list.filter((s) => s.status === "DANGER").length,
    checkNeeded: list.filter((s) => s.status === "CHECK_NEEDED").length,
    unacknowledged,
  };
}

export async function getCurrentFacility(): Promise<Facility> {
  return (await requestJson("/facilities/current")) as Facility;
}

export async function listFloors(): Promise<Floor[]> {
  return expectArray<Floor>(await requestJson("/floors"), "floors");
}

export async function listSpaces(): Promise<Space[]> {
  return expectArray<Space>(await requestJson("/spaces"), "spaces");
}

function statusFromSpace(space: Space): SpaceStatus {
  return {
    id: `status-${space.id}`,
    spaceId: space.id,
    peopleCount: 0,
    movementLevel: "LOW",
    fallRiskLevel: "LOW",
    status: "STABLE",
    aiSummary: "",
    lastDetectedAt: "",
    kakaoAlertStatus: "NONE",
    emergency: false,
  };
}

function buildStatusesFromSpaces(spaces: Space[]): Record<string, SpaceStatus> {
  return Object.fromEntries(spaces.map((space) => [space.id, statusFromSpace(space)]));
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

export const dashboardReadModelPath = {
  superAdmin: () => "/dashboards/super-admin",
  facilityAdmin: (facilityId: string) =>
    `/dashboards/facilities/${pathSegment(facilityId)}/admin`,
  facilityStaff: (facilityId: string) =>
    `/dashboards/facilities/${pathSegment(facilityId)}/staff`,
  facilityMonitor: (facilityId: string, floorId?: string | "all") => {
    const base = `/dashboards/facilities/${pathSegment(facilityId)}/monitor`;
    return floorId ? `${base}?floorId=${pathSegment(floorId)}` : base;
  },
};

export async function listStatuses(): Promise<Record<string, SpaceStatus>> {
  return buildStatusesFromSpaces(await listSpaces());
}

export async function getDashboardFromBackend(): Promise<DashboardResponse> {
  const [facility, floors, spaces, alerts] = await Promise.all([
    getCurrentFacility(),
    listFloors(),
    listSpaces(),
    listAlerts(),
  ]);
  const baseline: DashboardResponse = {
    facility,
    floors,
    spaces,
    statuses: buildStatusesFromSpaces(spaces),
    summary: buildSummary(buildStatusesFromSpaces(spaces), 0),
    unacknowledgedEvents: [],
  };
  return mergeAlertsIntoDashboard(baseline, alerts);
}
